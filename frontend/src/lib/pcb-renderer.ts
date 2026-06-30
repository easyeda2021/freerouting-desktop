import { App, Line, Ellipse, Group, Rect, Polygon, Text } from 'leafer-ui'
import '@leafer-in/view'
import type { BoardData, ShapeData, TraceData, ViaData, ComponentData, SelectedObject, NetPinRef } from './board-types'
import { getLayerColor } from './layer-colors'

const VIA_COLOR = '#a0a0a0'
const VIA_STROKE = '#555555'
const RATSNEST_COLOR = '#ffffff'

export function createPcbRenderer(container: HTMLElement) {
  const app = new App({
    view: container,
    tree: { type: 'design' as const },
    wheel: { zoomMode: false },
    move: { disabled: true },
  })
  // DSN/SES coordinates are Y-up; canvas is Y-down
  ;(app.tree as any).scaleY = -1

  const layerGroups = new Map<string, Group>()
  const measurementGroup = new Group({})
  const gridGroup = new Group({})
  const crosshairGroup = new Group({})
  let ratsnestGroup: Group | null = null
  let lastBounds = { minX: -500, minY: -500, maxX: 500, maxY: 500, maxDim: 1000 }

  function clear() {
    layerGroups.forEach((g) => g.clear())
    layerGroups.clear()
    app.tree.clear()
    app.tree.add(gridGroup)
    app.tree.add(measurementGroup)
    app.tree.add(crosshairGroup)
  }

  function resize() {
    ;(app as any).resize?.()
    // Wait a frame so the canvas/view bounds reflect the new container size
    requestAnimationFrame(() => {
      ;(app as any).resize?.()
      fitView()
    })
  }

  function fitView() {
    try {
      const tree = app.tree as any
      const rect = container.getBoundingClientRect()
      const { minX, minY, maxX, maxY, maxDim } = lastBounds
      if (!Number.isFinite(maxDim) || maxDim <= 0 || rect.width <= 0 || rect.height <= 0) return
      const padding = 0.95
      const scale = Math.min(rect.width / (maxX - minX), rect.height / (maxY - minY)) * padding
      const s = Math.max(0.0001, Math.min(scale, 1000))
      tree.scaleX = s
      tree.scaleY = -s
      tree.x = rect.width / 2 - ((minX + maxX) / 2) * s
      tree.y = rect.height / 2 - ((minY + maxY) / 2) * s
    } catch (e) {
      console.error('PCB fit error:', e)
    }
  }

  function render(
    data: BoardData,
    visibility: Record<string, boolean>,
    options: {
      hiddenNets?: Set<string>
      selectedNet?: string | null
      selectedObject?: SelectedObject | null
      layerColors?: Record<string, string>
      onSelectTrace?: (trace: TraceData) => void
      onSelectVia?: (via: ViaData) => void
      onSelectComponent?: (comp: ComponentData) => void
      onSelectPad?: (pad: SelectedObject) => void
    } = {}
  ) {
    try {
      clear()
      drawGrid()

      const bounds = computeBounds(data)
      lastBounds = bounds
      const outlineWidth = Math.max(bounds.maxDim * 0.002, 1)
      const hiddenNets = options.hiddenNets || new Set<string>()
      const selectedNet = options.selectedNet || null
      const selectedObject = options.selectedObject || null
      const layerColors = options.layerColors || {}

      // Group traces by layer
      for (const trace of data.traces) {
        if (visibility[trace.layer] === false) continue
        if (trace.netName && hiddenNets.has(trace.netName)) continue
        const points = trace.corners.flat()
        if (points.some(Number.isNaN)) continue
        let group = layerGroups.get(trace.layer)
        if (!group) {
          group = new Group({})
          layerGroups.set(trace.layer, group)
          app.tree.add(group)
        }
        const isOutline = trace.netName === ''
        const isSelected = selectedNet !== null && trace.netName === selectedNet
        const line = new Line({
          points,
          strokeWidth: isOutline ? outlineWidth : Math.max(trace.width, 0.5),
          stroke: isOutline ? '#e0e0e0' : (isSelected ? '#ffffff' : getLayerColor(trace.layer, layerColors)),
          strokeCap: 'round',
          strokeJoin: 'round',
        })
        if (options.onSelectTrace) {
          line.on('pointer.down', () => options.onSelectTrace!(trace))
        }
        group.add(line)
      }

      // Render vias (fixed color, separate from layer traces/pads)
      const viaGroup = new Group({})
      app.tree.add(viaGroup)
      for (const via of data.vias) {
        if (Number.isNaN(via.center[0]) || Number.isNaN(via.center[1])) continue
        if (via.netName && hiddenNets.has(via.netName)) continue
        const isSelected = selectedNet !== null && via.netName === selectedNet
        const ellipse = new Ellipse({
          x: via.center[0] - via.diameter / 2,
          y: via.center[1] - via.diameter / 2,
          width: via.diameter,
          height: via.diameter,
          fill: isSelected ? '#ffffff' : VIA_COLOR,
          stroke: isSelected ? '#ffffff' : VIA_STROKE,
          strokeWidth: Math.max(via.diameter * 0.08, 1),
        })
        if (options.onSelectVia) {
          ellipse.on('pointer.down', () => options.onSelectVia!(via))
        }
        viaGroup.add(ellipse)
      }

      // Determine top/bottom layer names for back-side component flipping
      const topLayer = data.layers[0]?.name
      const bottomLayer = data.layers[data.layers.length - 1]?.name

      const padstackMap = new Map(data.padstacks.map((ps) => [ps.name, ps]))
      const imageMap = new Map(data.images.map((img) => [img.name, img]))

      // Build pin -> net lookup for highlighting pads by selected net
      const pinToNet = new Map<string, string>()
      for (const [netName, refs] of Object.entries(data.netPins || {})) {
        for (const ref of refs) {
          pinToNet.set(`${ref.refdes}-${ref.pinNumber}`, netName)
        }
      }

      // Render component body outlines behind pads so pads remain visible
      const compGroup = new Group({})
      app.tree.add(compGroup)
      for (const comp of data.components) {
        if (Number.isNaN(comp.location[0]) || Number.isNaN(comp.location[1])) continue
        const image = imageMap.get(comp.package)
        const isBack = comp.side === 'back'
        const marker = new Group({
          x: comp.location[0],
          y: comp.location[1],
          rotation: comp.rotation,
        })
        // Back-side components are mirrored horizontally around their center
        const content = new Group({ scaleX: isBack ? -1 : 1 })
        marker.add(content)
        if (image && image.outlines.length > 0) {
          for (const outline of image.outlines) {
            const points = outline.corners.flat()
            if (points.some(Number.isNaN)) continue
            content.add(
              new Line({
                points,
                strokeWidth: Math.max(outline.width, 0.5),
                stroke: isBack ? '#909090' : '#c0c0c0',
                strokeCap: 'round',
                strokeJoin: 'round',
              })
            )
          }
        } else {
          // Fall back to a faint pin-bounding-box marker
          let minX = -100, minY = -100, maxX = 100, maxY = 100
          if (image && image.pins.length > 0) {
            minX = Infinity; minY = Infinity; maxX = -Infinity; maxY = -Infinity
            for (const pin of image.pins) {
              if (pin.x < minX) minX = pin.x
              if (pin.y < minY) minY = pin.y
              if (pin.x > maxX) maxX = pin.x
              if (pin.y > maxY) maxY = pin.y
            }
            if (!Number.isFinite(minX)) {
              minX = -100; minY = -100; maxX = 100; maxY = 100
            }
          }
          content.add(
            new Rect({
              x: minX,
              y: minY,
              width: maxX - minX,
              height: maxY - minY,
              fill: 'transparent',
              stroke: isBack ? '#808080' : '#a0a0a0',
              strokeWidth: Math.max(bounds.maxDim * 0.0005, 0.5),
            })
          )
        }
        if (options.onSelectComponent) {
          marker.on('pointer.down', () => options.onSelectComponent!(comp))
        }
        compGroup.add(marker)
      }

      // Render pads from library images + padstacks, colored by layer, on top of outlines
      const padGroup = new Group({})
      app.tree.add(padGroup)
      for (const comp of data.components) {
        if (Number.isNaN(comp.location[0]) || Number.isNaN(comp.location[1])) continue
        const image = imageMap.get(comp.package)
        if (!image) continue
        const isBack = comp.side === 'back'
        const compBase = new Group({
          x: comp.location[0],
          y: comp.location[1],
          rotation: comp.rotation,
        })
        const content = new Group({ scaleX: isBack ? -1 : 1 })
        compBase.add(content)
        for (const pin of image.pins) {
          const padstack = padstackMap.get(pin.padstackName)
          if (!padstack) continue
          for (const shape of padstack.shapes) {
            let layer = shape.layer
            if (isBack && topLayer && bottomLayer && topLayer !== bottomLayer) {
              // Back-side components live on the bottom; flip top/bottom copper layers
              if (layer === topLayer) {
                layer = bottomLayer
              } else if (layer === bottomLayer) {
                layer = topLayer
              } else {
                // Heuristic for alternate naming like top_copper / bottom_copper
                const lower = layer.toLowerCase()
                if (lower.includes('top') && !lower.includes('bottom')) {
                  layer = bottomLayer
                } else if (lower.includes('bottom') && !lower.includes('top')) {
                  layer = topLayer
                }
              }
            }
            if (visibility[layer] === false) continue
            const color = getLayerColor(layer, layerColors)
            const g = new Group({
              x: pin.x,
              y: pin.y,
              rotation: pin.rotation,
            })
            renderShape(shape, g, color)
            const padNet = pinToNet.get(`${comp.refdes}-${pin.pinNumber}`)
            const isPadSelected = selectedObject?.type === 'pad' && selectedObject.id === `${comp.refdes}-${pin.pinNumber}-${layer}`
            const isPadNetSelected = selectedNet !== null && padNet === selectedNet
            if (isPadSelected || isPadNetSelected) {
              addPadHighlight(g, shape)
            }
            if (options.onSelectPad) {
              g.on('pointer.down', () =>
                options.onSelectPad!({
                  type: 'pad',
                  id: `${comp.refdes}-${pin.pinNumber}-${layer}`,
                  refdes: comp.refdes,
                  pinNumber: pin.pinNumber,
                  layer,
                })
              )
            }
            content.add(g)
          }
        }
        padGroup.add(compBase)
      }

      // Render ratsnest airwires
      ratsnestGroup = new Group({})
      app.tree.add(ratsnestGroup)
      if (visibility['ratsnest'] !== false) {
        drawRatsnest(data, ratsnestGroup, hiddenNets, selectedNet, layerColors, getScale())
      }

    } catch (e) {
      console.error('PCB render error:', e)
    }
  }

  function destroy() {
    app.destroy()
  }

  function drawGrid() {
    gridGroup.clear()
    const { minX, minY, maxX, maxY, maxDim } = lastBounds
    if (maxDim <= 0) return

    // Choose a power-of-ten spacing that gives roughly 10-20 divisions
    const raw = maxDim / 15
    const exp = Math.floor(Math.log10(Math.max(raw, 1)))
    const spacing = Math.pow(10, exp)

    const startX = Math.floor(minX / spacing) * spacing
    const endX = Math.ceil(maxX / spacing) * spacing
    const startY = Math.floor(minY / spacing) * spacing
    const endY = Math.ceil(maxY / spacing) * spacing

    const lineWidth = Math.max(maxDim * 0.0002, 0.2)
    const originWidth = Math.max(maxDim * 0.0008, 0.8)

    for (let x = startX; x <= endX + spacing * 0.5; x += spacing) {
      const isOrigin = Math.abs(x) < spacing * 0.001
      gridGroup.add(
        new Line({
          points: [x, minY, x, maxY],
          strokeWidth: isOrigin ? originWidth : lineWidth,
          stroke: isOrigin ? '#4a5568' : '#1a2338',
        })
      )
    }
    for (let y = startY; y <= endY + spacing * 0.5; y += spacing) {
      const isOrigin = Math.abs(y) < spacing * 0.001
      gridGroup.add(
        new Line({
          points: [minX, y, maxX, y],
          strokeWidth: isOrigin ? originWidth : lineWidth,
          stroke: isOrigin ? '#4a5568' : '#1a2338',
        })
      )
    }
  }

  function screenToBoard(sx: number, sy: number): [number, number] {
    const rect = container.getBoundingClientRect()
    const tree = app.tree as any
    const scaleX = tree.scaleX || 1
    const scaleY = tree.scaleY || 1
    const tx = tree.x || 0
    const ty = tree.y || 0
    return [
      (sx - rect.left - tx) / scaleX,
      (sy - rect.top - ty) / scaleY,
    ]
  }

  function panTo(x: number, y: number) {
    const rect = container.getBoundingClientRect()
    const tree = app.tree as any
    tree.x = rect.width / 2 - x * (tree.scaleX || 1)
    tree.y = rect.height / 2 - y * (tree.scaleY || 1)
  }

  function formatLength(units: number): { mm: string; mil: string } {
    // Default DSN resolution: 1 unit = 0.1 um if denominator is 10
    const um = units / 10
    const mm = um / 1000
    const mil = um / 25.4
    return {
      mm: mm >= 1 ? `${mm.toFixed(2)} mm` : `${mm.toFixed(3)} mm`,
      mil: mil >= 1 ? `${mil.toFixed(2)} mil` : `${mil.toFixed(3)} mil`,
    }
  }

  function drawMeasurement(start: [number, number] | null, end: [number, number] | null) {
    measurementGroup.clear()
    if (!start) return

    const r = Math.max(lastBounds.maxDim * 0.004, 3)
    const lineWidth = Math.max(lastBounds.maxDim * 0.0015, 0.5)
    const color = '#f5a623'

    measurementGroup.add(
      new Ellipse({
        x: start[0] - r,
        y: start[1] - r,
        width: r * 2,
        height: r * 2,
        fill: color,
        stroke: '#ffffff',
        strokeWidth: Math.max(r * 0.08, 0.5),
      })
    )

    if (!end) return

    measurementGroup.add(
      new Ellipse({
        x: end[0] - r,
        y: end[1] - r,
        width: r * 2,
        height: r * 2,
        fill: color,
        stroke: '#ffffff',
        strokeWidth: Math.max(r * 0.08, 0.5),
      })
    )

    measurementGroup.add(
      new Line({
        points: [start[0], start[1], end[0], end[1]],
        strokeWidth: lineWidth,
        stroke: color,
        strokeCap: 'round',
        strokeJoin: 'round',
      })
    )

    const dx = end[0] - start[0]
    const dy = end[1] - start[1]
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist <= 0) return

    const angle = Math.atan2(dy, dx)
    const midX = (start[0] + end[0]) / 2
    const midY = (start[1] + end[1]) / 2

    // Perpendicular offset for dimension line
    const offset = Math.max(lastBounds.maxDim * 0.015, 20)
    const ox = -Math.sin(angle) * offset
    const oy = Math.cos(angle) * offset

    const dimStart = [start[0] + ox, start[1] + oy] as [number, number]
    const dimEnd = [end[0] + ox, end[1] + oy] as [number, number]

    measurementGroup.add(
      new Line({
        points: [dimStart[0], dimStart[1], dimEnd[0], dimEnd[1]],
        strokeWidth: lineWidth,
        stroke: color,
      })
    )

    // Tick marks at endpoints of dimension line
    measurementGroup.add(new Line({ points: [start[0], start[1], start[0] + ox * 0.6, start[1] + oy * 0.6], strokeWidth: lineWidth, stroke: color }))
    measurementGroup.add(new Line({ points: [end[0], end[1], end[0] + ox * 0.6, end[1] + oy * 0.6], strokeWidth: lineWidth, stroke: color }))

    // Label background
    const label = formatLength(dist)
    const labelText = `${label.mm} / ${label.mil}`
    const fontSize = Math.max(lastBounds.maxDim * 0.012, 12)
    const text = new Text({
      text: labelText,
      x: midX + ox,
      y: midY + oy,
      fill: '#ffffff',
      fontSize,
      fontWeight: 'bold',
      textAlign: 'center',
    })
    // Counteract tree Y-flip so text reads upright
    const textGroup = new Group({ x: midX + ox, y: midY + oy, scaleY: -1 })
    text.x = 0
    text.y = 0
    textGroup.add(text)
    measurementGroup.add(textGroup)
  }

  function clearMeasurement() {
    measurementGroup.clear()
  }

  function drawCrosshair(pos: [number, number] | null) {
    crosshairGroup.clear()
    if (!pos) return
    const tree = app.tree as any
    const sx = tree.scaleX || 1
    const sy = tree.scaleY || 1
    const tx = tree.x || 0
    const ty = tree.y || 0
    const rect = container.getBoundingClientRect()

    // Draw in screen space: counteract tree scale so lines stay 1px and span the view
    crosshairGroup.scaleX = 1 / sx
    crosshairGroup.scaleY = 1 / sy

    const cx = pos[0] * sx
    const cy = pos[1] * sy
    const xMin = -tx
    const xMax = rect.width - tx
    const yMin = -ty
    const yMax = rect.height - ty

    crosshairGroup.add(
      new Line({
        points: [xMin, cy, xMax, cy],
        strokeWidth: 1,
        stroke: '#ffffff',
      })
    )
    crosshairGroup.add(
      new Line({
        points: [cx, yMin, cx, yMax],
        strokeWidth: 1,
        stroke: '#ffffff',
      })
    )
  }

  function getScale() {
    const tree = app.tree as any
    return tree.scaleX || 1
  }

  function updateRatsnestWidth() {
    if (!ratsnestGroup) return
    const tree = app.tree as any
    const w = 1 / Math.abs(tree.scaleX || 1)
    ratsnestGroup.children.forEach((child) => {
      if ((child as any).strokeWidth !== undefined) {
        (child as any).strokeWidth = w
      }
    })
  }

  function zoomBy(delta: number, cx?: number, cy?: number) {
    const tree = app.tree as any
    const sx = tree.scaleX || 1
    const sy = tree.scaleY || 1
    const factor = delta > 0 ? 0.9 : 1.1
    const next = Math.max(0.001, Math.min(Math.abs(sx) * factor, 1000))
    const signX = Math.sign(sx) || 1
    const signY = Math.sign(sy) || 1
    if (cx !== undefined && cy !== undefined) {
      // Zoom towards pointer position, respecting the Y-flip
      const wx = (cx - (tree.x || 0)) / sx
      const wy = (cy - (tree.y || 0)) / sy
      tree.scaleX = next * signX
      tree.scaleY = next * signY
      tree.x = cx - wx * next * signX
      tree.y = cy - wy * next * signY
    } else {
      tree.scaleX = next * signX
      tree.scaleY = next * signY
    }
    updateRatsnestWidth()
  }

  function panBy(dx: number, dy: number) {
    const tree = app.tree as any
    tree.x = (tree.x || 0) + dx
    tree.y = (tree.y || 0) + dy
  }

  return { render, destroy, resize, zoomBy, panBy, getScale, fitView, screenToBoard, panTo, drawMeasurement, clearMeasurement, drawCrosshair }
}

function addPadHighlight(group: Group, shape: ShapeData) {
  const hl = '#ffffff'
  const sw = 1.5
  if (shape.shapeType === 'circle') {
    const d = shape.params[0] + 6
    group.add(
      new Ellipse({
        x: -d / 2,
        y: -d / 2,
        width: d,
        height: d,
        fill: 'transparent',
        stroke: hl,
        strokeWidth: sw,
      })
    )
  } else if (shape.shapeType === 'rect') {
    const [x1, y1, x2, y2] = shape.params
    const pad = 3
    group.add(
      new Rect({
        x: x1 - pad,
        y: y1 - pad,
        width: x2 - x1 + pad * 2,
        height: y2 - y1 + pad * 2,
        fill: 'transparent',
        stroke: hl,
        strokeWidth: sw,
      })
    )
  } else if (shape.shapeType === 'path') {
    const width = shape.params[0]
    if (width > 0) {
      const d = width + 6
      group.add(
        new Ellipse({
          x: -d / 2,
          y: -d / 2,
          width: d,
          height: d,
          fill: 'transparent',
          stroke: hl,
          strokeWidth: sw,
        })
      )
    }
  } else if (shape.shapeType === 'polygon') {
    const coords = shape.params.slice(1)
    if (coords.length >= 6) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (let i = 0; i < coords.length; i += 2) {
        minX = Math.min(minX, coords[i])
        minY = Math.min(minY, coords[i + 1])
        maxX = Math.max(maxX, coords[i])
        maxY = Math.max(maxY, coords[i + 1])
      }
      const pad = 3
      group.add(
        new Rect({
          x: minX - pad,
          y: minY - pad,
          width: maxX - minX + pad * 2,
          height: maxY - minY + pad * 2,
          fill: 'transparent',
          stroke: hl,
          strokeWidth: sw,
        })
      )
    }
  }
}

function renderShape(shape: ShapeData, group: Group, color: string) {
  if (shape.shapeType === 'circle') {
    const d = shape.params[0]
    group.add(
      new Ellipse({
        x: -d / 2,
        y: -d / 2,
        width: d,
        height: d,
        fill: color,
        stroke: darken(color),
        strokeWidth: Math.max(d * 0.04, 1),
      })
    )
  } else if (shape.shapeType === 'rect') {
    const [x1, y1, x2, y2] = shape.params
    group.add(
      new Rect({
        x: x1,
        y: y1,
        width: x2 - x1,
        height: y2 - y1,
        fill: color,
        stroke: darken(color),
        strokeWidth: Math.max((x2 - x1) * 0.03, 1),
      })
    )
  } else if (shape.shapeType === 'path') {
    const width = shape.params[0]
    const coords = shape.params.slice(1)
    if (coords.length >= 4 && width > 0) {
      const x1 = coords[0]
      const y1 = coords[1]
      const x2 = coords[2]
      const y2 = coords[3]
      const dx = x2 - x1
      const dy = y2 - y1
      const centerline = Math.sqrt(dx * dx + dy * dy)
      // DSN path width is the pad width; total pad length includes the semicircular end caps
      const length = centerline + width
      if (centerline === 0) {
        // Zero-length path: render as a circle (EasyEDA/KiCad round pads)
        group.add(
          new Ellipse({
            x: x1 - width / 2,
            y: y1 - width / 2,
            width,
            height: width,
            fill: color,
            stroke: darken(color),
            strokeWidth: Math.max(width * 0.04, 1),
          })
        )
      } else {
        // Render as a stadium (bullet): rounded rect with true semicircular ends
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI
        const cx = (x1 + x2) / 2
        const cy = (y1 + y2) / 2
        const capsule = new Group({ x: cx, y: cy, rotation: angle })
        capsule.add(
          new Rect({
            x: -length / 2,
            y: -width / 2,
            width: length,
            height: width,
            cornerRadius: width / 2,
            fill: color,
            stroke: darken(color),
            strokeWidth: Math.max(width * 0.04, 1),
          })
        )
        group.add(capsule)
      }
    }
  } else if (shape.shapeType === 'polygon') {
    const coords = shape.params.slice(1)
    if (coords.length >= 6) {
      // Deduplicate consecutive duplicate points common in EasyEDA polygon pads
      const deduped: number[] = []
      for (let i = 0; i < coords.length; i += 2) {
        const x = coords[i]
        const y = coords[i + 1]
        if (i === 0 || x !== coords[i - 2] || y !== coords[i - 1]) {
          deduped.push(x, y)
        }
      }
      if (deduped.length >= 6) {
        group.add(
          new Polygon({
            points: deduped,
            fill: color,
            stroke: darken(color),
            strokeWidth: Math.max(shape.params[0] * 0.5, 0.5),
          })
        )
      }
    }
  }
}

function padWorldPos(comp: ComponentData, pin: NetPinRef | { x: number; y: number; rotation?: number }): [number, number] {
  const rad = ((comp.rotation || 0) * Math.PI) / 180
  let x = 'x' in pin ? pin.x : 0
  let y = 'x' in pin ? pin.y : 0
  let rx = x * Math.cos(rad) - y * Math.sin(rad)
  let ry = x * Math.sin(rad) + y * Math.cos(rad)
  if (comp.side === 'back') rx = -rx
  return [comp.location[0] + rx, comp.location[1] + ry]
}

class UnionFind {
  private parent: number[]
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i)
  }
  find(x: number): number {
    return this.parent[x] === x ? x : (this.parent[x] = this.find(this.parent[x]))
  }
  union(a: number, b: number) {
    this.parent[this.find(a)] = this.find(b)
  }
}

function mstEdges(points: [number, number][]): Array<[number, number, number, number]> {
  if (points.length < 2) return []
  const edges: Array<{ i: number; j: number; d: number }> = []
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dx = points[i][0] - points[j][0]
      const dy = points[i][1] - points[j][1]
      edges.push({ i, j, d: Math.hypot(dx, dy) })
    }
  }
  edges.sort((a, b) => a.d - b.d)
  const parent = Array.from({ length: points.length }, (_, i) => i)
  const find = (x: number): number => parent[x] === x ? x : parent[x] = find(parent[x])
  const union = (a: number, b: number) => { parent[find(a)] = find(b) }
  const result: Array<[number, number, number, number]> = []
  for (const e of edges) {
    if (find(e.i) !== find(e.j)) {
      union(e.i, e.j)
      result.push([points[e.i][0], points[e.i][1], points[e.j][0], points[e.j][1]])
    }
  }
  return result
}

function drawRatsnest(
  data: BoardData,
  group: Group,
  hiddenNets: Set<string>,
  selectedNet: string | null,
  layerColors: Record<string, string>,
  scale: number
) {
  if (!data.netPins || Object.keys(data.netPins).length === 0) return
  const imageMap = new Map(data.images.map((img) => [img.name, img]))
  const componentMap = new Map(data.components.map((c) => [c.refdes, c]))
  const lineWidth = 1 / Math.abs(scale || 1)
  const tolerance = 1.0

  for (const [netName, refs] of Object.entries(data.netPins)) {
    if (hiddenNets.has(netName)) continue
    const padPoints: [number, number][] = []
    for (const ref of refs) {
      const comp = componentMap.get(ref.refdes)
      const image = comp ? imageMap.get(comp.package) : undefined
      const pin = image?.pins.find((p) => p.pinNumber === ref.pinNumber)
      if (!comp || !pin) continue
      padPoints.push(padWorldPos(comp, pin))
    }
    if (padPoints.length < 2) continue

    const netTraces = data.traces.filter((t) => t.netName === netName)
    const netVias = data.vias.filter((v) => v.netName === netName)

    // Build a point cloud of pads + trace corners + via centers, then union
    // connected points so routed nets no longer show airwires between them.
    const points: [number, number][] = [...padPoints]
    for (const t of netTraces) {
      for (const c of t.corners) points.push([c[0], c[1]])
    }
    for (const v of netVias) {
      points.push([v.center[0], v.center[1]])
    }
    const uf = new UnionFind(points.length)
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        if (Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1]) <= tolerance) {
          uf.union(i, j)
        }
      }
    }
    let idx = padPoints.length
    for (const t of netTraces) {
      for (let k = 0; k < t.corners.length - 1; k++) {
        uf.union(idx + k, idx + k + 1)
      }
      idx += t.corners.length
    }

    const groups = new Map<number, [number, number][]>()
    for (let i = 0; i < padPoints.length; i++) {
      const root = uf.find(i)
      if (!groups.has(root)) groups.set(root, [])
      groups.get(root)!.push(padPoints[i])
    }
    const reps: [number, number][] = []
    for (const list of groups.values()) {
      if (list.length > 0) reps.push(list[0])
    }
    if (reps.length < 2) continue

    const isSelected = selectedNet !== null && netName === selectedNet
    const color = isSelected ? '#ffffff' : (layerColors['ratsnest'] || RATSNEST_COLOR)
    for (const [x1, y1, x2, y2] of mstEdges(reps)) {
      group.add(
        new Line({
          points: [x1, y1, x2, y2],
          stroke: color,
          strokeWidth: lineWidth,
          strokeCap: 'round',
        })
      )
    }
  }
}

function computeBounds(data: BoardData) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  function expand(x: number, y: number) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  for (const trace of data.traces) {
    for (const [x, y] of trace.corners) expand(x, y)
  }
  for (const via of data.vias) expand(via.center[0], via.center[1])
  for (const comp of data.components) expand(comp.location[0], comp.location[1])
  if (!Number.isFinite(minX)) {
    minX = 0; minY = 0; maxX = 1000; maxY = 1000
  }
  return {
    minX, minY, maxX, maxY,
    maxDim: Math.max(maxX - minX, maxY - minY, 1),
  }
}

function darken(color: string): string {
  // Simple hex darken for pad/via stroke borders
  const hex = color.replace('#', '')
  const r = Math.max(0, parseInt(hex.slice(0, 2), 16) - 60)
  const g = Math.max(0, parseInt(hex.slice(2, 4), 16) - 60)
  const b = Math.max(0, parseInt(hex.slice(4, 6), 16) - 60)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}
