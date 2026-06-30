import { useMemo, useState } from 'react'
import { useApp } from '../App'
import { t } from '../lib/i18n'

export default function NetList() {
  const { state, dispatch } = useApp()
  const { boardData, nets, selectedNet, language } = state
  const [filter, setFilter] = useState('')

  useMemo(() => {
    if (!boardData) return
    const netMap = new Map<string, { traces: number; vias: number }>()
    for (const t of boardData.traces) {
      if (!t.netName) continue
      const cur = netMap.get(t.netName) || { traces: 0, vias: 0 }
      cur.traces++
      netMap.set(t.netName, cur)
    }
    for (const v of boardData.vias) {
      if (!v.netName) continue
      const cur = netMap.get(v.netName) || { traces: 0, vias: 0 }
      cur.vias++
      netMap.set(v.netName, cur)
    }
    const existing = new Map(nets.map((n) => [n.name, n]))
    const next: typeof nets = []
    for (const [name, counts] of netMap) {
      const prev = existing.get(name)
      next.push({
        name,
        traceCount: counts.traces,
        viaCount: counts.vias,
        visible: prev?.visible ?? true,
        priority: prev?.priority ?? 0,
      })
    }
    next.sort((a, b) => a.name.localeCompare(b.name))
    if (JSON.stringify(next) !== JSON.stringify(nets)) {
      dispatch({ type: 'SET_NETS', nets: next })
    }
  }, [boardData, dispatch, nets])

  if (!boardData) return null

  const filtered = nets.filter((n) => n.name.toLowerCase().includes(filter.toLowerCase()))
  const visibleCount = nets.filter((n) => n.visible).length

  return (
    <div style={s.panel}>
      <h3 style={s.title}>{t('nets', language)} ({visibleCount}/{nets.length})</h3>
      <input
        style={s.filter}
        placeholder={language === 'zh' ? '过滤网络...' : 'Filter nets...'}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <div style={s.list}>
        {filtered.map((net) => (
          <div
            key={net.name}
            style={{
              ...s.item,
              ...(selectedNet === net.name ? s.selected : {}),
              opacity: net.visible ? 1 : 0.4,
            }}
            onClick={() => dispatch({ type: 'SELECT_NET', netName: selectedNet === net.name ? null : net.name })}
          >
            <input
              type="checkbox"
              checked={net.visible}
              onClick={(e) => e.stopPropagation()}
              onChange={() => dispatch({ type: 'TOGGLE_NET_VISIBILITY', netName: net.name })}
            />
            <span style={s.name}>{net.name}</span>
            <span style={s.count}>T:{net.traceCount} V:{net.viaCount}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  panel: {},
  title: { fontSize: 11, fontWeight: 700, marginBottom: 8, color: '#8fa3bf', textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  filter: { width: '100%', background: '#0f3460', color: '#e0e0e0', border: '1px solid #1c3a5e', borderRadius: 4, padding: '5px 8px', fontSize: 11, boxSizing: 'border-box', outline: 'none' },
  list: { maxHeight: 220, overflowY: 'auto', marginTop: 8 },
  item: { display: 'flex', alignItems: 'center', gap: 6, padding: '5px 6px', fontSize: 11, cursor: 'pointer', borderRadius: 4, transition: 'background 0.1s' },
  selected: { background: '#0f3460' },
  name: { flex: 1, color: '#c8d4e5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  count: { color: '#7e8fa8', fontSize: 10, fontVariantNumeric: 'tabular-nums' },
}
