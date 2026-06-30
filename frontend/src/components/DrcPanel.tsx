import { useApp } from '../App'
import { t } from '../lib/i18n'

export default function DrcPanel() {
  const { state, dispatch } = useApp()
  const { drcResults, jobState, language } = state

  if (!drcResults.length && jobState !== 'COMPLETED') return null

  return (
    <div style={s.panel}>
      <h3 style={s.title}>{t('drc', language)} ({drcResults.length})</h3>
      {drcResults.length === 0 ? (
        <p style={s.empty}>{language === 'zh' ? '无违规' : 'No violations'}</p>
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
  panel: {
    background: '#0f1c36',
    border: '1px solid #1c3a5e',
    borderRadius: 6,
    padding: '8px 10px',
  },
  title: { fontSize: 11, fontWeight: 700, marginBottom: 6, color: '#8fa3bf', textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  empty: { fontSize: 11, color: '#888', padding: '2px 0' },
  list: { maxHeight: 160, overflowY: 'auto' },
  item: { display: 'flex', flexWrap: 'wrap', gap: 6, padding: '4px 5px', fontSize: 11, borderBottom: '1px solid #0f3460', cursor: 'pointer' },
  badge: { background: '#e94560', color: '#fff', padding: '1px 4px', borderRadius: 3, fontSize: 10 },
  msg: { flex: '1 1 100%', color: '#ccc' },
  meta: { color: '#888', fontSize: 10 },
}
