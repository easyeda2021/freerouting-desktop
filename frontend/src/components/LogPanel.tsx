import { useEffect, useRef } from 'react'
import { useApp } from '../App'

export default function LogPanel() {
  const { state } = useApp()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight
    }
  }, [state.logEntries])

  return (
    <div ref={ref} style={s.panel}>
      {state.logEntries.map((entry, i) => (
        <div key={i} style={{ ...s.line, color: entry.type === 'Error' ? '#e94560' : entry.type === 'Warn' ? '#f5a623' : '#888' }}>
          <span style={s.time}>{entry.timestamp ? entry.timestamp.slice(11, 19) : '--:--:--'}</span>
          <span style={s.type}>{entry.type ? entry.type.padEnd(5) : ''}</span>
          {entry.message ?? ''}
        </div>
      ))}
      {state.logEntries.length === 0 && <div style={s.empty}>Log output will appear here...</div>}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  panel: {
    height: 150,
    padding: '4px 12px',
    background: '#0a0a1a',
    borderTop: '1px solid #0f3460',
    overflowY: 'auto',
    fontFamily: "'Cascadia Code', 'Consolas', monospace",
    fontSize: 11,
    flexShrink: 0,
  },
  line: { padding: '1px 0', whiteSpace: 'nowrap' },
  time: { marginRight: 8, color: '#555' },
  type: { marginRight: 8, color: '#555' },
  empty: { color: '#444', fontStyle: 'italic' },
}
