import { useApp } from '../App'
import RoutingSettings from './RoutingSettings'
import NetList from './NetList'
import DrcPanel from './DrcPanel'

export default function SidePanel() {
  const { state, dispatch } = useApp()
  const { boardData, layerVisibility } = state

  return (
    <div style={s.panel}>
      <h3 style={s.title}>Layers</h3>
      {boardData?.layers.map((l) => (
        <label key={l.name} style={s.layer}>
          <input
            type="checkbox"
            checked={layerVisibility[l.name] ?? true}
            onChange={() => dispatch({ type: 'TOGGLE_LAYER', layer: l.name })}
          />
          <span style={{ color: getLayerColor(l.index) }}>●</span>
          {l.name}
        </label>
      ))}
      {boardData && (
        <div style={s.stats}>
          <h3 style={s.title}>Stats</h3>
          <p style={s.stat}>Traces: {boardData.traces.length}</p>
          <p style={s.stat}>Vias: {boardData.vias.length}</p>
          <p style={s.stat}>Components: {boardData.components.length}</p>
        </div>
      )}
      <RoutingSettings />
      <NetList />
      <DrcPanel />
      <SelectionInfo />
    </div>
  )
}

function SelectionInfo() {
  const { state } = useApp()
  const { selectedNet, selectedObject } = state

  if (!selectedNet && !selectedObject) return null

  return (
    <div style={s.panel}>
      <h3 style={s.title}>Selection</h3>
      {selectedNet && <p style={s.stat}>Net: {selectedNet}</p>}
      {selectedObject && (
        <div style={s.stat}>
          <p style={s.stat}>Type: {selectedObject.type}</p>
          {selectedObject.refdes && <p style={s.stat}>Refdes: {selectedObject.refdes}</p>}
          {selectedObject.pinNumber && <p style={s.stat}>Pin: {selectedObject.pinNumber}</p>}
          {selectedObject.layer && <p style={s.stat}>Layer: {selectedObject.layer}</p>}
          {selectedObject.netName && <p style={s.stat}>Net: {selectedObject.netName}</p>}
        </div>
      )}
    </div>
  )
}

const LAYER_COLORS = ['#e94560', '#0f3460', '#16c79a', '#f5a623', '#a855f7', '#06b6d4', '#84cc16', '#ec4899']
function getLayerColor(index: number) {
  return LAYER_COLORS[index % LAYER_COLORS.length]
}

const s: Record<string, React.CSSProperties> = {
  panel: {
    width: 220,
    padding: 12,
    background: '#16213e',
    borderLeft: '1px solid #0f3460',
    overflowY: 'auto',
    flexShrink: 0,
  },
  title: { fontSize: 12, fontWeight: 600, marginBottom: 8, color: '#aaa', textTransform: 'uppercase' as const },
  layer: { display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', fontSize: 12, cursor: 'pointer' },
  stats: { marginTop: 20 },
  stat: { fontSize: 11, padding: '2px 0', color: '#999' },
}
