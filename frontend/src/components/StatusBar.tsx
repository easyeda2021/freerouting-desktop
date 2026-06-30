import { useApp } from '../App'
import { t } from '../lib/i18n'

export default function StatusBar() {
  const { state } = useApp()
  const { boardData, measurement, selectedObject, selectedNet, displayUnit, language } = state

  const resolution = boardData?.resolutionDenominator || 1

  function toPhysical(value: number): string {
    // DSN resolution: e.g. (resolution um 10) => 1 coord unit = 0.1 um
    const micrometers = value / resolution
    const mm = micrometers / 1000
    const mil = micrometers / 25.4
    if (displayUnit === 'mil') {
      return `${mil.toFixed(Math.abs(mil) >= 1 ? 2 : 3)} mil`
    }
    return `${mm.toFixed(Math.abs(mm) >= 1 ? 2 : 3)} mm`
  }

  const cursor = measurement.cursor
  const distance = measurement.start && measurement.end
    ? Math.hypot(measurement.end[0] - measurement.start[0], measurement.end[1] - measurement.start[1])
    : null

  return (
    <div style={s.bar}>
      <div style={s.left}>
        {cursor && (
          <span style={s.coord}>
            X: {toPhysical(cursor[0])} &nbsp; Y: {toPhysical(cursor[1])}
          </span>
        )}
        {measurement.active && <span style={s.mode}>{t('measureMode', language)}</span>}
        {distance !== null && (
          <span style={s.distance}>{t('distance', language)}: {toPhysical(distance)}</span>
        )}
      </div>
      <div style={s.right}>
        {selectedNet && <span style={s.info}>{t('net', language)}: {selectedNet}</span>}
        {selectedObject && (
          <span style={s.info}>
            {selectedObject.type === 'component' && `${t('component', language)}: ${selectedObject.refdes}`}
            {selectedObject.type === 'pad' && `${t('pad', language)}: ${selectedObject.refdes}-${selectedObject.pinNumber} (${selectedObject.layer})`}
            {selectedObject.type === 'trace' && `${t('trace', language)}: ${selectedObject.netName || 'outline'}`}
            {selectedObject.type === 'via' && `${t('via', language)}: ${selectedObject.netName || ''}`}
          </span>
        )}
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  bar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '4px 12px',
    background: '#0a0a1a',
    borderTop: '1px solid #0f3460',
    fontSize: 11,
    color: '#aaa',
    flexShrink: 0,
  },
  left: { display: 'flex', alignItems: 'center', gap: 16 },
  right: { display: 'flex', alignItems: 'center', gap: 16 },
  coord: { fontFamily: "'Cascadia Code', 'Consolas', monospace", color: '#ccc' },
  mode: { color: '#f5a623', fontWeight: 600 },
  distance: { color: '#f5a623', fontWeight: 600 },
  info: { color: '#ccc' },
}
