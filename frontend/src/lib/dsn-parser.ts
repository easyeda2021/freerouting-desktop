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
  try {
    const tokens = tokenize(content)
    const pos = { i: 0 }
    let root: SExpr
    try {
      root = parseList(tokens, pos)
    } catch (e) {
      console.error('DSN token parse error:', e)
      return emptyBoard()
    }

    // DSN is wrapped in (PCB ...) or (pcb ...) — unwrap

  // DSN is wrapped in (PCB ...) or (pcb ...) — unwrap
  const sections: SExpr[] = []
  const rootName = String(root[0]).toLowerCase()
  if (rootName === 'pcb') {
    for (let i = 1; i < root.length; i++) {
      if (Array.isArray(root[i])) sections.push(root[i])
    }
  } else {
    sections.push(...root.filter(Array.isArray))
  }

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

  // EasyEDA DSN files declare (resolution mil 1000) but output float values
  // already in mils.
  function addPath(pathList: SExpr[], netName: string) {
    const layer = String(pathList[1])
    const width = Number(pathList[2])
    layerSet.add(layer)
    const corners: [number, number][] = []

    let i = 3
    if (i < pathList.length && Array.isArray(pathList[i]) && (pathList[i] as SExpr[])[0] === 'pt') {
      for (; i < pathList.length; i++) {
        if (Array.isArray(pathList[i]) && (pathList[i] as SExpr[])[0] === 'pt') {
          const pt = pathList[i] as SExpr[]
          corners.push([Number(pt[1]), Number(pt[2])])
        }
      }
    } else {
      for (; i < pathList.length - 1; i += 2) {
        corners.push([Number(pathList[i]), Number(pathList[i + 1])])
      }
    }
    if (corners.length >= 2) {
      boardData.traces.push({ netName, layer, width, corners })
    }
  }

  // Parse resolution (may be at PCB level or inside structure)
  const pcbResolution = findList(sections, 'resolution')
  if (pcbResolution && pcbResolution.length >= 3) {
    boardData.resolutionUnit = String(pcbResolution[1])
    boardData.resolutionDenominator = Number(pcbResolution[2])
  }

  // Parse structure section
  const structure = findList(sections, 'structure')
  if (structure) {
    const resolution = findList(structure, 'resolution')
    if (resolution && resolution.length >= 3) {
      boardData.resolutionUnit = String(resolution[1])
      boardData.resolutionDenominator = Number(resolution[2])
    }

    // Parse layer definitions — structure may contain multiple (layer ...) entries
    for (const item of structure) {
      if (Array.isArray(item) && item.length >= 2 && item[0] === 'layer') {
        layerSet.add(String(item[1]))
      }
    }

    // Parse board boundary (outline)
    const boundary = findList(structure, 'boundary')
    if (boundary) {
      for (const bItem of boundary) {
        if (Array.isArray(bItem) && bItem.length >= 2 && (bItem[0] === 'path' || bItem[0] === 'wire')) {
          const coords: [number, number][] = []
          for (let i = 2; i < bItem.length - 1; i += 2) {
            coords.push([Number(bItem[i]), Number(bItem[i + 1])])
          }
          if (coords.length >= 2) {
            boardData.traces.push({
              netName: '',
              layer: String(bItem[1]),
              width: 0.5,
              corners: coords,
            })
          }
        }
      }
    }
  }

  // Parse network section
  const network = findList(sections, 'network')
  if (network) {
    for (const item of network) {
      if (!Array.isArray(item) || item[0] !== 'net') continue
      const netName = String(item[1])
      const netList = item as SExpr[]

      for (const subRaw of netList.slice(2)) {
        if (!Array.isArray(subRaw)) continue
        const sub = subRaw as SExpr[]

        if (sub[0] === 'wire') {
          for (const wsRaw of sub.slice(1)) {
            if (!Array.isArray(wsRaw)) continue
            const ws = wsRaw as SExpr[]
            if (ws[0] === 'path') addPath(ws, netName)
          }
        }

        if (sub[0] === 'path') {
          addPath(sub, netName)
        }

        if (sub[0] === 'via') {
          const via: ViaData = {
            netName,
            padstackName: String(sub[1]),
            center: [Number(sub[2]), Number(sub[3])],
            diameter: 30,
          }
          if (sub[4] !== undefined && typeof sub[4] === 'number') {
            via.diameter = Number(sub[4])
          }
          boardData.vias.push(via)
        }
      }
    }
  }

  // Parse placement section
  const placement = findList(sections, 'placement')
  if (placement) {
    for (const item of placement) {
      if (!Array.isArray(item) || item[0] !== 'component') continue
      for (const sub of item.slice(1)) {
        if (!Array.isArray(sub) || sub[0] !== 'place') continue
        boardData.components.push({
          refdes: String(sub[1]),
          package: String(item[1]),
          location: [Number(sub[2]), Number(sub[3])],
          side: String(sub[4]).toLowerCase() === 'back' ? 'back' : 'front',
          rotation: Number(sub[5]) || 0,
        })
      }
    }
  }

  boardData.layers = Array.from(layerSet).map((name, index) => ({ name, index }))

  return boardData
  } catch (e) {
    console.error('DSN parse error:', e)
    return emptyBoard()
  }
}

function emptyBoard(): BoardData {
  return { resolutionUnit: 'um', resolutionDenominator: 1, layers: [], traces: [], vias: [], components: [], padstacks: [] }
}
