import { useApp } from '../App'

export default function StatusBar() {
  const { state } = useApp()
  const { boardData, measurement, selectedObject, selectedNet } = state

  const resolution = boardData?.resolutionDenominator || 1
  const unit = boardData?.resolutionUnit || 'um'

  function toPhysical(value: number): string {
    // DSN resolution: e.g. (resolution um 10) => 1 coord unit = 0.1 um
    const micrometers = value / resolution
    if (unit === 'um' || unit === 'micron') {
      if (Math.abs(micrometers) >= 1000) return `${(micrometers / 1000).toFixed(3)} mm`
      return `${micrometers.toFixed(1)} um`
    }
    return `${value.toFixed(2)} ${unit}`
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
        {measurement.active && <span style={s.mode}>Measure mode</span>}
        {distance !== null && (
          <span style={s.distance}>Distance: {toPhysical(distance)}</span>
        )}
      </div>
      <div style={s.right}>
        {selectedNet && <span style={s.info}>Net: {selectedNet}</span>}
        {selectedObject && (
          <span style={s.info}>
            {selectedObject.type === 'component' && `Component: ${selectedObject.refdes}`}
            {selectedObject.type === 'pad' && `Pad: ${selectedObject.refdes}-${selectedObject.pinNumber} (${selectedObject.layer})`}
            {selectedObject.type === 'trace' && `Trace: ${selectedObject.netName || 'outline'}`}
            {selectedObject.type === 'via' && `Via: ${selectedObject.netName || ''}`}
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
