import { App, Line, Ellipse, Group, Rect, Polygon } from 'leafer-ui'
import '@leafer-in/view'
import type { BoardData, ShapeData } from './board-types'

const LAYER_COLORS = ['#e94560', '#0f3460', '#16c79a', '#f5a623', '#a855f7', '#06b6d4', '#84cc16', '#ec4899']
const VIA_COLOR = '#a0a0a0'
const VIA_STROKE = '#555555'

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

  function clear() {
    layerGroups.forEach((g) => g.clear())
    layerGroups.clear()
    app.tree.clear()
  }

  function resize() {
    ;(app as any).resize?.()
    fitView()
  }

  function fitView() {
    try {
      const tree = app.tree as any
      tree.zoom?.('fit')
      // Preserve Y-flip after fit
      tree.scaleY = -Math.abs(tree.scaleX || 1)
    } catch (e) {
      console.error('PCB fit error:', e)
    }
  }

  function render(data: BoardData, visibility: Record<string, boolean>) {
    try {
      clear()

      const bounds = computeBounds(data)
      const outlineWidth = Math.max(bounds.maxDim * 0.002, 1)

      // Group traces by layer
      for (const trace of data.traces) {
        if (visibility[trace.layer] === false) continue
        const points = trace.corners.flat()
        if (points.some(Number.isNaN)) continue
        let group = layerGroups.get(trace.layer)
        if (!group) {
          group = new Group({})
          layerGroups.set(trace.layer, group)
          app.tree.add(group)
        }
        const isOutline = trace.netName === ''
        group.add(
          new Line({
            points,
            strokeWidth: isOutline ? outlineWidth : Math.max(trace.width, 0.5),
            stroke: isOutline ? '#e0e0e0' : getLayerColor(trace.layer),
            strokeCap: 'round',
            strokeJoin: 'round',
          })
        )
      }

      // Render vias (fixed color, separate from layer traces/pads)
      const viaGroup = new Group({})
      app.tree.add(viaGroup)
      for (const via of data.vias) {
        if (Number.isNaN(via.center[0]) || Number.isNaN(via.center[1])) continue
        viaGroup.add(
          new Ellipse({
            x: via.center[0] - via.diameter / 2,
            y: via.center[1] - via.diameter / 2,
            width: via.diameter,
            height: via.diameter,
            fill: VIA_COLOR,
            stroke: VIA_STROKE,
            strokeWidth: Math.max(via.diameter * 0.08, 1),
          })
        )
      }

      // Render pads from library images + padstacks, colored by layer
      const padGroup = new Group({})
      app.tree.add(padGroup)
      const padstackMap = new Map(data.padstacks.map((ps) => [ps.name, ps]))
      const imageMap = new Map(data.images.map((img) => [img.name, img]))
      for (const comp of data.components) {
        if (Number.isNaN(comp.location[0]) || Number.isNaN(comp.location[1])) continue
        const image = imageMap.get(comp.package)
        if (!image) continue
        for (const pin of image.pins) {
          const padstack = padstackMap.get(pin.padstackName)
          if (!padstack) continue
          const pinPos = rotatePoint(pin.x, pin.y, comp.rotation)
          const absX = comp.location[0] + pinPos.x
          const absY = comp.location[1] + pinPos.y
          for (const shape of padstack.shapes) {
            if (visibility[shape.layer] === false) continue
            const color = getLayerColor(shape.layer)
            const g = new Group({
              x: absX,
              y: absY,
              rotation: comp.rotation + pin.rotation,
            })
            renderShape(shape, g, color)
            padGroup.add(g)
          }
        }
      }

      // Render component body markers (outline from pin bounding box)
      const compGroup = new Group({})
      app.tree.add(compGroup)
      for (const comp of data.components) {
        if (Number.isNaN(comp.location[0]) || Number.isNaN(comp.location[1])) continue
        const image = imageMap.get(comp.package)
        let minX = -100, minY = -100, maxX = 100, maxY = 100
        if (image && image.pins.length > 0) {
          minX = Infinity; minY = Infinity; maxX = -Infinity; maxY = -Infinity
          for (const pin of image.pins) {
            const p = rotatePoint(pin.x, pin.y, comp.rotation + pin.rotation)
            if (p.x < minX) minX = p.x
            if (p.y < minY) minY = p.y
            if (p.x > maxX) maxX = p.x
            if (p.y > maxY) maxY = p.y
          }
          if (!Number.isFinite(minX)) {
            minX = -100; minY = -100; maxX = 100; maxY = 100
          }
        }
        const rect = new Rect({
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY,
          fill: 'transparent',
          stroke: comp.side === 'back' ? '#a0a0a0' : '#e0e0e0',
          strokeWidth: Math.max(bounds.maxDim * 0.001, 1),
          rotation: comp.rotation,
        })
        const marker = new Group({
          x: comp.location[0],
          y: comp.location[1],
        })
        marker.add(rect)
        compGroup.add(marker)
      }

      // Auto-fit after layout
      requestAnimationFrame(fitView)
    } catch (e) {
      console.error('PCB render error:', e)
    }
  }

  function destroy() {
    app.destroy()
  }

  function getScale() {
    const tree = app.tree as any
    return tree.scaleX || 1
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
  }

  function panBy(dx: number, dy: number) {
    const tree = app.tree as any
    tree.x = (tree.x || 0) + dx
    tree.y = (tree.y || 0) + dy
  }

  return { render, destroy, resize, zoomBy, panBy, getScale }
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
    if (coords.length >= 4) {
      const x1 = coords[0]
      const y1 = coords[1]
      const x2 = coords[2]
      const y2 = coords[3]
      const dx = x2 - x1
      const dy = y2 - y1
      const length = Math.sqrt(dx * dx + dy * dy)
      if (length > 0) {
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI
        const cx = (x1 + x2) / 2
        const cy = (y1 + y2) / 2
        const capsule = new Group({ x: cx, y: cy, rotation: angle })
        capsule.add(
          new Ellipse({
            x: -width / 2,
            y: -(length + width) / 2,
            width,
            height: length + width,
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
      group.add(
        new Polygon({
          points: coords,
          fill: color,
          stroke: darken(color),
          strokeWidth: Math.max(shape.params[0] * 0.5, 0.5),
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

function rotatePoint(x: number, y: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return { x: x * cos - y * sin, y: x * sin + y * cos }
}

function getLayerColor(layerName: string): string {
  const hash = layerName.split('').reduce((h, c) => h + c.charCodeAt(0), 0)
  return LAYER_COLORS[hash % LAYER_COLORS.length]
}

function darken(color: string): string {
  // Simple hex darken for pad/via stroke borders
  const hex = color.replace('#', '')
  const r = Math.max(0, parseInt(hex.slice(0, 2), 16) - 60)
  const g = Math.max(0, parseInt(hex.slice(2, 4), 16) - 60)
  const b = Math.max(0, parseInt(hex.slice(4, 6), 16) - 60)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}
