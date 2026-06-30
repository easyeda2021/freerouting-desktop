import { useApp } from '../App'

export default function DrcPanel() {
  const { state, dispatch } = useApp()
  const { drcResults, jobState } = state

  if (!drcResults.length && jobState !== 'COMPLETED') return null

  return (
    <div style={s.panel}>
      <h3 style={s.title}>DRC ({drcResults.length})</h3>
      {drcResults.length === 0 ? (
        <p style={s.empty}>No violations</p>
      ) : (
        <div style={s.list}>
          {drcResults.map((v, idx) => (
            <div
              key={idx}
              style={s.item}
              onClick={() => {
                if (v.netName) dispatch({ type: 'SELECT_NET', netName: v.netName })
                dispatch({ type: 'SET_PAN_TARGET', target: { x: v.x, y: v.y } })
              }}
            >
              <span style={s.badge}>{v.type}</span>
              <span style={s.msg}>{v.message}</span>
              {v.netName && <span style={s.meta}>{v.netName}</span>}
              {v.layer && <span style={s.meta}>{v.layer}</span>}
              <span style={s.meta}>{v.x.toFixed(1)}, {v.y.toFixed(1)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  panel: { marginTop: 16 },
  title: { fontSize: 12, fontWeight: 600, marginBottom: 8, color: '#aaa', textTransform: 'uppercase' as const },
  empty: { fontSize: 11, color: '#888', padding: '4px 0' },
  list: { maxHeight: 200, overflowY: 'auto' },
  item: { display: 'flex', flexWrap: 'wrap', gap: 6, padding: '5px 6px', fontSize: 11, borderBottom: '1px solid #0f3460', cursor: 'pointer' },
  badge: { background: '#e94560', color: '#fff', padding: '1px 4px', borderRadius: 3, fontSize: 10 },
  msg: { flex: '1 1 100%', color: '#ccc' },
  meta: { color: '#888', fontSize: 10 },
}
