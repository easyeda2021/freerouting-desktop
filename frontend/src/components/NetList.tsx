import { useMemo, useRef, useState } from 'react'
import { useApp } from '../App'
import { t } from '../lib/i18n'

export default function NetList() {
  const { state, dispatch } = useApp()
  const { boardData, nets, selectedNet, language } = state
  const [filter, setFilter] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useMemo(() => {
    if (!boardData) return
    const netMap = new Map<string, { traces: number; vias: number }>()
    // Nets come from DSN netlist, not just routed traces/vias
    for (const netName of Object.keys(boardData.netPins || {})) {
      netMap.set(netName, { traces: 0, vias: 0 })
    }
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

  const filtered = nets.filter((n) => n.name.toLowerCase().includes(filter.toLowerCase()))
  const visibleCount = nets.filter((n) => n.visible).length

  const clearFilter = () => {
    setFilter('')
    inputRef.current?.focus()
  }

  return (
    <div style={s.panel}>
      <h3 style={s.title}>{t('nets', language)} ({visibleCount}/{nets.length})</h3>
      <div style={s.filterWrap}>
        <input
          ref={inputRef}
          style={s.filter}
          placeholder={t('filterNets', language)}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          disabled={!boardData}
        />
        {filter && (
          <button
            type="button"
            style={s.clearBtn}
            onClick={clearFilter}
            title={t('clearFilter', language)}
            aria-label={t('clearFilter', language)}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
      <div style={s.list}>
        {boardData ? (
          filtered.map((net) => (
            <div
              key={net.name}
              style={{
                ...s.item,
                ...(selectedNet === net.name ? s.selected : {}),
                opacity: net.visible ? 1 : 0.4,
              }}
              onClick={() => {
                const next = selectedNet === net.name ? null : net.name
                dispatch({ type: 'SELECT_NET', netName: next })
                dispatch({ type: 'SELECT_OBJECT', object: null })
              }}
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
          ))
        ) : (
          <div style={s.empty}>{t('openDsnHint', language)}</div>
        )}
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  panel: {
    background: '#0f1c36',
    border: '1px solid #1c3a5e',
    borderRadius: 6,
    padding: 10,
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
  },
  title: { fontSize: 11, fontWeight: 700, margin: '0 0 8px 0', color: '#8fa3bf', textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  filterWrap: { position: 'relative', width: '100%' },
  filter: { width: '100%', background: '#0f3460', color: '#e0e0e0', border: '1px solid #1c3a5e', borderRadius: 4, padding: '5px 24px 5px 8px', fontSize: 11, boxSizing: 'border-box', outline: 'none' },
  clearBtn: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', color: '#7e8fa8', cursor: 'pointer', padding: 0, borderRadius: '0 4px 4px 0' },
  list: { flex: 1, overflowY: 'auto', marginTop: 8, minHeight: 0 },
  item: { display: 'flex', alignItems: 'center', gap: 6, padding: '5px 6px', fontSize: 11, cursor: 'pointer', borderRadius: 4, transition: 'background 0.1s' },
  selected: { background: '#0f3460' },
  name: { flex: 1, color: '#c8d4e5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  count: { color: '#7e8fa8', fontSize: 10, fontVariantNumeric: 'tabular-nums' },
  empty: { color: '#7e8fa8', fontSize: 11, padding: '8px 4px', fontStyle: 'italic' },
}
