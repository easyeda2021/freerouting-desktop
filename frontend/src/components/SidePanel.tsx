import { useApp } from '../App'
import DrcPanel from './DrcPanel'

export default function SidePanel() {
  const { state, dispatch } = useApp()
  const { boardData, layerVisibility } = state

  return (
    <div style={s.panel}>
      <div style={s.section}>
        <h3 style={s.title}>Layers</h3>
        <div style={s.layerList}>
          {boardData?.layers.map((l) => (
            <label key={l.name} style={s.layer}>
              <input
                type="checkbox"
                checked={layerVisibility[l.name] ?? true}
                onChange={() => dispatch({ type: 'TOGGLE_LAYER', layer: l.name })}
              />
              <span style={{ color: getLayerColor(l.index) }}>●</span>
              <span>{l.name}</span>
            </label>
          ))}
        </div>
      </div>

      {boardData && (
        <div style={s.section}>
          <h3 style={s.title}>Stats</h3>
          <div style={s.statRow}>
            <span style={s.statLabel}>Traces</span>
            <span style={s.statValue}>{boardData.traces.length}</span>
          </div>
          <div style={s.statRow}>
            <span style={s.statLabel}>Vias</span>
            <span style={s.statValue}>{boardData.vias.length}</span>
          </div>
          <div style={s.statRow}>
            <span style={s.statLabel}>Components</span>
            <span style={s.statValue}>{boardData.components.length}</span>
          </div>
        </div>
      )}

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
    <div style={s.section}>
      <h3 style={s.title}>Selection</h3>
      {selectedNet && <div style={s.statRow}><span style={s.statLabel}>Net</span><span style={s.statValue}>{selectedNet}</span></div>}
      {selectedObject && (
        <>
          <div style={s.statRow}>
            <span style={s.statLabel}>Type</span>
            <span style={s.statValue}>{selectedObject.type}</span>
          </div>
          {selectedObject.refdes && <div style={s.statRow}><span style={s.statLabel}>Refdes</span><span style={s.statValue}>{selectedObject.refdes}</span></div>}
          {selectedObject.pinNumber && <div style={s.statRow}><span style={s.statLabel}>Pin</span><span style={s.statValue}>{selectedObject.pinNumber}</span></div>}
          {selectedObject.layer && <div style={s.statRow}><span style={s.statLabel}>Layer</span><span style={s.statValue}>{selectedObject.layer}</span></div>}
          {selectedObject.netName && <div style={s.statRow}><span style={s.statLabel}>Net</span><span style={s.statValue}>{selectedObject.netName}</span></div>}
        </>
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
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  section: {
    background: '#0f1c36',
    border: '1px solid #1c3a5e',
    borderRadius: 6,
    padding: 10,
  },
  title: {
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 8,
    color: '#8fa3bf',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  layerList: { display: 'flex', flexDirection: 'column', gap: 2 },
  layer: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 6px',
    fontSize: 12,
    cursor: 'pointer',
    borderRadius: 4,
  },
  statRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '3px 0',
    fontSize: 11,
  },
  statLabel: { color: '#8fa3bf' },
  statValue: { color: '#e0e0e0', fontWeight: 500 },
}
