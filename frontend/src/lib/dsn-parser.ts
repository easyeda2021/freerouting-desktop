import type { BoardData, ViaData } from './board-types'

type Token =
  | { type: 'open' }
  | { type: 'close' }
  | { type: 'string'; value: string }
  | { type: 'integer'; value: number }
  | { type: 'float'; value: number }

class DsnTokenizer {
  private input: string
  private pos = 0

  constructor(input: string) {
    this.input = input
  }

  nextToken(): Token | null {
    this.skipWhitespace()
    if (this.pos >= this.input.length) return null

    const ch = this.input[this.pos]
    if (ch === '(') { this.pos++; return { type: 'open' } }
    if (ch === ')') { this.pos++; return { type: 'close' } }
    if (ch === '"') return this.readString()
    if (/[+-]?\d/.test(ch)) return this.readNumber()
    return this.readBareword()
  }

  private skipWhitespace() {
    while (this.pos < this.input.length) {
      const ch = this.input[this.pos]
      if (ch === ';') {
        while (this.pos < this.input.length && this.input[this.pos] !== '\n') this.pos++
        continue
      }
      if (!/\s/.test(ch)) break
      this.pos++
    }
  }

  private readString(): Token {
    this.pos++
    let value = ''
    while (this.pos < this.input.length) {
      const ch = this.input[this.pos++]
      if (ch === '"') break
      if (ch === '\\') { value += this.input[this.pos++] || '' }
      else { value += ch }
    }
    return { type: 'string', value }
  }

  private readNumber(): Token {
    let num = ''
    let isFloat = false
    while (this.pos < this.input.length) {
      const ch = this.input[this.pos]
      if (/[0-9]/.test(ch)) { num += ch; this.pos++ }
      else if (ch === '.' && !isFloat) { isFloat = true; num += ch; this.pos++ }
      else if (ch === '-' || ch === '+') { if (num === '') { num += ch; this.pos++ } else break }
      else break
    }
    if (isFloat) return { type: 'float', value: parseFloat(num) }
    return { type: 'integer', value: parseInt(num, 10) }
  }

  private readBareword(): Token {
    let value = ''
    while (this.pos < this.input.length) {
      const ch = this.input[this.pos]
      if (/\s/.test(ch) || ch === '(' || ch === ')' || ch === '"') break
      value += ch
      this.pos++
    }
    return { type: 'string', value }
  }
}

type SExpr = string | number | SExpr[]

function tokenize(input: string): Token[] {
  const t = new DsnTokenizer(input)
  const tokens: Token[] = []
  let token: Token | null
  while ((token = t.nextToken())) tokens.push(token)
  return tokens
}

function parseList(tokens: Token[], pos: { i: number }): SExpr[] {
  const t = tokens[pos.i++]
  if (!t || t.type !== 'open') throw new Error('Expected open')
  const items: SExpr[] = []
  while (pos.i < tokens.length && tokens[pos.i].type !== 'close') {
    if (tokens[pos.i].type === 'open') {
      items.push(parseList(tokens, pos))
    } else {
      const tok = tokens[pos.i++]
      if (tok.type === 'string') items.push(tok.value)
      else if (tok.type === 'integer') items.push(tok.value)
      else if (tok.type === 'float') items.push(tok.value)
    }
  }
  if (pos.i >= tokens.length || tokens[pos.i].type !== 'close') throw new Error('Expected close')
  pos.i++
  return items
}

function findList(items: SExpr[], keyword: string): SExpr[] | null {
  for (const item of items) {
    if (Array.isArray(item) && item.length > 0 && item[0] === keyword) return item
  }
  return null
}

export function parseDsn(content: string): BoardData {
  const tokens = tokenize(content)
  const pos = { i: 0 }
  const root = parseList(tokens, pos)

  const boardData: BoardData = {
    resolutionUnit: 'um',
    resolutionDenominator: 1,
    layers: [],
    traces: [],
    vias: [],
    components: [],
    padstacks: [],
  }

  const layerSet = new Set<string>()
  let denom = 1

  // Parse structure section
  const structure = findList(root, 'structure')
  if (structure) {
    const resolution = findList(structure, 'resolution')
    if (resolution && resolution.length >= 3) {
      boardData.resolutionUnit = String(resolution[1])
      boardData.resolutionDenominator = Number(resolution[2])
      denom = boardData.resolutionDenominator || 1
    }

    // Parse layer definitions
    const layerList = findList(structure, 'layer')
    if (layerList) {
      for (let i = 1; i < layerList.length; i++) {
        const item = layerList[i]
        if (Array.isArray(item) && item.length >= 1) {
          layerSet.add(String(item[0]))
        }
      }
    }
  }

  // Parse network section
  const network = findList(root, 'network')
  if (network) {
    for (const item of network) {
      if (!Array.isArray(item) || item[0] !== 'net') continue
      const netName = String(item[1])

      for (const sub of item.slice(2)) {
        if (!Array.isArray(sub)) continue

        // Parse paths (wires/traces)
        if (sub[0] === 'path') {
          const layer = String(sub[1])
          const width = Number(sub[2]) / denom
          layerSet.add(layer)
          const corners: [number, number][] = []
          for (let i = 3; i < sub.length - 1; i += 2) {
            corners.push([Number(sub[i]) / denom, Number(sub[i + 1]) / denom])
          }
          if (corners.length >= 2) {
            boardData.traces.push({ netName, layer, width, corners })
          }
        }

        // Parse vias
        if (sub[0] === 'via') {
          const via: ViaData = {
            netName,
            padstackName: String(sub[1]),
            center: [Number(sub[2]) / denom, Number(sub[3]) / denom],
            diameter: 30 / denom, // default fallback
          }
          // Try to get diameter from via structure
          if (sub[4] !== undefined && typeof sub[4] === 'number') {
            via.diameter = Number(sub[4]) / denom
          }
          boardData.vias.push(via)
        }
      }
    }
  }

  // Parse placement section
  const placement = findList(root, 'placement')
  if (placement) {
    for (const item of placement) {
      if (!Array.isArray(item) || item[0] !== 'component') continue
      for (const sub of item.slice(1)) {
        if (!Array.isArray(sub) || sub[0] !== 'place') continue
        boardData.components.push({
          refdes: String(sub[1]),
          package: String(item[1]),
          location: [Number(sub[2]) / denom, Number(sub[3]) / denom],
          side: String(sub[4]).toLowerCase() === 'back' ? 'back' : 'front',
          rotation: Number(sub[5]) || 0,
        })
      }
    }
  }

  boardData.layers = Array.from(layerSet).map((name, index) => ({ name, index }))

  return boardData
}
