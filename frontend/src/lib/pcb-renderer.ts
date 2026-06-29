import { App, Line, Ellipse, Group } from 'leafer-ui'
import type { BoardData } from './board-types'

const LAYER_COLORS = ['#e94560', '#0f3460', '#16c79a', '#f5a623', '#a855f7', '#06b6d4', '#84cc16', '#ec4899']

export function createPcbRenderer(container: HTMLElement) {
  const app = new App({
    view: container,
    tree: { type: 'design' as const },
    wheel: { zoomMode: true },
    move: { disabled: false, holdSpaceKey: false },
  })

  const layerGroups = new Map<string, Group>()

  function clear() {
    layerGroups.forEach((g) => g.clear())
    layerGroups.clear()
  }

  function render(data: BoardData, visibility: Record<string, boolean>) {
    try {
    clear()
    app.tree.clear()

    // Group traces by layer
    for (const trace of data.traces) {
      if (visibility[trace.layer] === false) continue
      let group = layerGroups.get(trace.layer)
      if (!group) {
        group = new Group({})
        layerGroups.set(trace.layer, group)
        app.tree.add(group)
      }
      group.add(
        new Line({
          points: trace.corners.flat(),
          strokeWidth: Math.max(trace.width, 0.5),
          stroke: getLayerColor(trace.layer),
          strokeCap: 'round',
          strokeJoin: 'round',
        })
      )
    }

    // Render vias
    const viaGroup = new Group({})
    app.tree.add(viaGroup)
    for (const via of data.vias) {
      viaGroup.add(
        new Ellipse({
          x: via.center[0] - via.diameter / 2,
          y: via.center[1] - via.diameter / 2,
          width: via.diameter,
          height: via.diameter,
          fill: '#555',
        })
      )
    }

    // Auto-fit on first render
    app.tree.zoom('fit')
    } catch (e) { console.error('PCB render error:', e) }
  }

  function destroy() {
    app.destroy()
  }

  return { render, destroy }
}

function getLayerColor(layerName: string): string {
  const hash = layerName.split('').reduce((h, c) => h + c.charCodeAt(0), 0)
  return LAYER_COLORS[hash % LAYER_COLORS.length]
}
