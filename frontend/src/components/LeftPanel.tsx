import RoutingSettings from './RoutingSettings'
import NetList from './NetList'

export default function LeftPanel() {
  return (
    <div style={s.panel}>
      <RoutingSettings />
      <NetList />
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  panel: {
    width: 220,
    padding: '12px 10px',
    background: '#16213e',
    borderRight: '1px solid #0f3460',
    overflowY: 'auto',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
}
