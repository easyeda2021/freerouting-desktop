import { useApp } from '../App'
import DrcPanel from './DrcPanel'
import { EyeOpenIcon, EyeClosedIcon } from './icons'
import { getLayerColor } from '../lib/layer-colors'
import { t } from '../lib/i18n'

export default function SidePanel() {
  const { state, dispatch } = useApp()
  const { boardData, layerVisibility, layerColors, language } = state

  const layers = boardData?.layers || []
  const allLayers = [
    ...layers,
    { name: 'ratsnest', index: layers.length },
  ]

  return (
    <div style={s.panel}>
      <div style={s.section}>
        <h3 style={s.title}>{t('layers', language)}</h3>
        <div style={s.layerList}>
          {allLayers.map((l) => {
            const isVisible = layerVisibility[l.name] ?? true
            const color = getLayerColor(l.name, layerColors)
            return (
              <div key={l.name} style={s.layer}>
                <button
                  style={{ ...s.eyeBtn, color: isVisible ? '#8fa3bf' : '#555' }}
                  onClick={() => dispatch({ type: 'TOGGLE_LAYER', layer: l.name })}
                  title={isVisible ? t('hideLayer', language) : t('showLayer', language)}
                >
                  {isVisible ? <EyeOpenIcon /> : <EyeClosedIcon />}
                </button>
                <label style={s.colorWrapper}>
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => dispatch({ type: 'SET_LAYER_COLOR', layer: l.name, color: e.target.value })}
                    style={s.colorInput}
                  />
                  <span style={{ ...s.colorDot, background: color }} />
                </label>
                <span style={{ ...s.layerName, opacity: isVisible ? 1 : 0.4 }}>{t(l.name, language) || l.name}</span>
              </div>
            )
          })}
        </div>
      </div>

      {boardData && (
        <div style={s.section}>
          <h3 style={s.title}>{t('stats', language)}</h3>
          <div style={s.statRow}>
            <span style={s.statLabel}>{t('traces', language)}</span>
            <span style={s.statValue}>{boardData.traces.length}</span>
          </div>
          <div style={s.statRow}>
            <span style={s.statLabel}>{t('vias', language)}</span>
            <span style={s.statValue}>{boardData.vias.length}</span>
          </div>
          <div style={s.statRow}>
            <span style={s.statLabel}>{t('components', language)}</span>
            <span style={s.statValue}>{boardData.components.length}</span>
          </div>
        </div>
      )}

      <SelectionInfo />
      <DrcPanel />
    </div>
  )
}

function SelectionInfo() {
  const { state } = useApp()
  const { selectedNet, selectedObject, language } = state

  if (!selectedNet && !selectedObject) return null

  return (
    <div style={s.section}>
      <h3 style={s.title}>{t('selection', language)}</h3>
      {selectedNet && <div style={s.statRow}><span style={s.statLabel}>{t('net', language)}</span><span style={s.statValue}>{selectedNet}</span></div>}
      {selectedObject && (
        <>
          <div style={s.statRow}>
            <span style={s.statLabel}>{t('type', language)}</span>
            <span style={s.statValue}>{t(selectedObject.type || 'component', language) || selectedObject.type}</span>
          </div>
          {selectedObject.refdes && <div style={s.statRow}><span style={s.statLabel}>{t('refdes', language)}</span><span style={s.statValue}>{selectedObject.refdes}</span></div>}
          {selectedObject.pinNumber && <div style={s.statRow}><span style={s.statLabel}>{t('pin', language)}</span><span style={s.statValue}>{selectedObject.pinNumber}</span></div>}
          {selectedObject.layer && <div style={s.statRow}><span style={s.statLabel}>{t('layer', language)}</span><span style={s.statValue}>{selectedObject.layer}</span></div>}
          {selectedObject.netName && <div style={s.statRow}><span style={s.statLabel}>{t('net', language)}</span><span style={s.statValue}>{selectedObject.netName}</span></div>}
        </>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  panel: {
    width: 220,
    padding: '12px 10px',
    background: '#16213e',
    borderLeft: '1px solid #0f3460',
    overflowY: 'auto',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  section: {
    background: '#0f1c36',
    border: '1px solid #1c3a5e',
    borderRadius: 6,
    padding: '8px 10px',
  },
  title: {
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 6,
    color: '#8fa3bf',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  layerList: { display: 'flex', flexDirection: 'column', gap: 1 },
  layer: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '3px 4px',
    fontSize: 12,
    borderRadius: 4,
  },
  eyeBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 16,
    height: 16,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    borderRadius: 3,
  },
  colorWrapper: {
    position: 'relative',
    width: 10,
    height: 10,
    borderRadius: '50%',
    cursor: 'pointer',
    flexShrink: 0,
  },
  colorInput: {
    position: 'absolute',
    inset: -5,
    opacity: 0,
    cursor: 'pointer',
    width: 20,
    height: 20,
    border: 'none',
    padding: 0,
  },
  colorDot: {
    display: 'block',
    width: 10,
    height: 10,
    borderRadius: '50%',
    border: '1px solid rgba(255,255,255,0.2)',
  },
  layerName: {
    color: '#c8d4e5',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  statRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '2px 0',
    fontSize: 11,
  },
  statLabel: { color: '#8fa3bf' },
  statValue: { color: '#e0e0e0', fontWeight: 500 },
}
