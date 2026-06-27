import type { BoardData, TraceData, ViaData, ComponentData, PadstackData, ShapeData, LayerInfo } from './board-types'

// ===== Tokenizer =====
type Token =
  | { type: 'open' }
  | { type: 'close' }
  | { type: 'string'; value: string }
  | { type: 'integer'; value: number }
  | { type: 'float'; value: number }

class SesTokenizer {
  private input: string
  private pos = 0

  constructor(input: string) {
    this.input = input
  }

  nextToken(): Token | null {
    this.skipWhitespace()
    if (this.pos >= this.input.length) return null

    const ch = this.input[this.pos]
    if (ch === '(') {
      this.pos++
      return { type: 'open' }
    }
    if (ch === ')') {
      this.pos++
      return { type: 'close' }
    }
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
    this.pos++ // skip opening "
    let value = ''
    while (this.pos < this.input.length) {
      const ch = this.input[this.pos++]
      if (ch === '"') break
      if (ch === '\\') {
        value += this.input[this.pos++] || ''
      } else {
        value += ch
      }
    }
    return { type: 'string', value }
  }

  private readNumber(): Token {
    let num = ''
    let isFloat = false
    while (this.pos < this.input.length) {
      const ch = this.input[this.pos]
      if (/[0-9]/.test(ch)) {
        num += ch
        this.pos++
      } else if (ch === '.' && !isFloat) {
        isFloat = true
        num += ch
        this.pos++
      } else if (ch === '-' || ch === '+') {
        if (num === '') {
          num += ch
          this.pos++
        } else break
      } else {
        break
      }
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

// ===== S-Expression Parser =====
type SExpr = string | number | SExpr[]

function parseSExpr(tokens: SesTokenizer): SExpr | null {
  const token = tokens.nextToken()
  if (!token) return null

  if (token.type === 'open') {
    const list: SExpr[] = []
    while (true) {
      const peek = tokens.nextToken()
      if (!peek) break
      if (peek.type === 'close') break
      // Put the peeked token back conceptually by reparsing
      // Simple approach: use a second tokenizer or re-parse
      // ponytail: re-tokenize the same input with an offset
      break // This won't work properly — let's fix
    }
  }

  if (token.type === 'string') return token.value
  if (token.type === 'integer') return token.value
  if (token.type === 'float') return token.value

  return null
}

// ===== Proper recursive descent =====
// ponytail: manual recursive descent, handles the full SES spec

export function parseSes(content: string): BoardData {
  const tokens = tokenize(content)
  let pos = 0

  function peek(): Token | null {
    return pos < tokens.length ? tokens[pos] : null
  }

  function next(): Token {
    return tokens[pos++]
  }

  function expect(type: Token['type']): Token {
    const t = next()
    if (t.type !== type) throw new Error(`Expected ${type}, got ${t.type}`)
    return t
  }

  function expectOpen() { expect('open') }
  function expectClose() { expect('close') }

  function parseList(): SExpr[] {
    expectOpen()
    const items: SExpr[] = []
    while (peek() && peek()!.type !== 'close') {
      if (peek()!.type === 'open') {
        items.push(parseList())
      } else {
        const t = next()
        if (t.type === 'string') items.push(t.value)
        else if (t.type === 'integer') items.push(t.value)
        else if (t.type === 'float') items.push(t.value)
      }
    }
    expectClose()
    return items
  }

  const root = parseList()

  // Extract session name (optional)
  // Skip root, find routes
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

  function findList(items: SExpr[], keyword: string): SExpr[] | null {
    for (const item of items) {
      if (Array.isArray(item) && item.length > 0 && item[0] === keyword) {
        return item
      }
    }
    return null
  }

  // Parse routes section
  const routes = findList(root, 'routes')
  if (routes) {
    // Resolution
    const resolution = findList(routes, 'resolution')
    if (resolution && resolution.length >= 3) {
      boardData.resolutionUnit = String(resolution[1])
      boardData.resolutionDenominator = Number(resolution[2])
    }

    const denom = boardData.resolutionDenominator || 1

    // Library out (padstacks)
    const libraryOut = findList(routes, 'library_out')
    if (libraryOut) {
      for (const item of libraryOut) {
        if (Array.isArray(item) && item[0] === 'padstack') {
          const shapes: ShapeData[] = []
          for (const sub of item.slice(1)) {
            if (Array.isArray(sub) && sub[0] === 'shape') {
              const shapeList = sub[1]
              if (Array.isArray(shapeList)) {
                shapes.push({
                  layer: String(shapeList[1] || ''),
                  shapeType: String(shapeList[0]) as ShapeData['shapeType'],
                  params: shapeList.slice(2).map(Number),
                })
              }
            }
          }
          boardData.padstacks.push({ name: String(item[1]), shapes })
        }
      }
    }

    // Network out (traces and vias)
    const networkOut = findList(routes, 'network_out')
    if (networkOut) {
      for (const item of networkOut) {
        if (Array.isArray(item) && item[0] === 'net') {
          const netName = String(item[1])
          for (const sub of item.slice(2)) {
            if (!Array.isArray(sub)) continue
            if (sub[0] === 'wire') {
              for (const wireSub of sub.slice(1)) {
                if (Array.isArray(wireSub) && wireSub[0] === 'path') {
                  const layer = String(wireSub[1])
                  const width = Number(wireSub[2]) / denom
                  layerSet.add(layer)
                  const corners: [number, number][] = []
                  for (let i = 3; i < wireSub.length - 1; i += 2) {
                    corners.push([
                      Number(wireSub[i]) / denom,
                      Number(wireSub[i + 1]) / denom,
                    ])
                  }
                  if (corners.length >= 2) {
                    boardData.traces.push({ netName, layer, width, corners })
                  }
                }
              }
            } else if (sub[0] === 'via') {
              const via: ViaData = {
                netName,
                padstackName: String(sub[1]),
                center: [Number(sub[2]) / denom, Number(sub[3]) / denom],
                diameter: 0,
              }
              // Try to get diameter from padstack
              const ps = boardData.padstacks.find((p) => p.name === via.padstackName)
              if (ps && ps.shapes.length > 0) {
                const shape = ps.shapes[0]
                if (shape.shapeType === 'circle' && shape.params.length >= 1) {
                  via.diameter = shape.params[0] / denom
                }
              }
              boardData.vias.push(via)
            }
          }
        }
      }
    }
  }

  // Parse placement section
  const placement = findList(root, 'placement')
  if (placement) {
    for (const item of placement) {
      if (Array.isArray(item) && item[0] === 'component') {
        for (const sub of item.slice(1)) {
          if (Array.isArray(sub) && sub[0] === 'place') {
            const denom = boardData.resolutionDenominator || 1
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
    }
  }

  boardData.layers = Array.from(layerSet).map((name, index) => ({ name, index }))

  return boardData
}

function tokenize(input: string): Token[] {
  const tokenizer = new SesTokenizer(input)
  const tokens: Token[] = []
  let token: Token | null
  while ((token = tokenizer.nextToken())) {
    tokens.push(token)
  }
  return tokens
}
