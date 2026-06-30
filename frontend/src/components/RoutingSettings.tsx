import { useEffect } from 'react'
import { useApp } from '../App'
import type { RoutingSettings } from '../lib/board-types'

const SETTINGS_KEY = 'fr_routing_settings'

const defaultSettings: RoutingSettings = {
  max_passes: 5,
  via_costs: 50,
  plane_via_costs: 25,
  start_ripup_costs: 100,
  improvement_threshold: 0.01,
  default_preferred_direction_trace_cost: 1.0,
  default_undesired_direction_trace_cost: 1.5,
  fanout_enabled: true,
  optimizer_enabled: true,
}

export function loadStoredSettings(): RoutingSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) return { ...defaultSettings, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return { ...defaultSettings }
}

function saveStoredSettings(settings: RoutingSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch { /* ignore */ }
}

export default function RoutingSettings() {
  const { state, dispatch } = useApp()
  const settings = { ...defaultSettings, ...state.routingSettings }

  useEffect(() => {
    dispatch({ type: 'SET_ROUTING_SETTINGS', settings: loadStoredSettings() })
  }, [dispatch])

  const update = (patch: Partial<RoutingSettings>) => {
    const next = { ...settings, ...patch }
    dispatch({ type: 'SET_ROUTING_SETTINGS', settings: patch })
    saveStoredSettings(next)
  }

  const row = (label: string, child: React.ReactNode) => (
    <div style={s.row}>
      <span style={s.label}>{label}</span>
      {child}
    </div>
  )

  return (
    <div style={s.panel}>
      <h3 style={s.title}>Routing Settings</h3>
      {row('Max passes', <input style={s.input} type="number" min={1} max={50} value={settings.max_passes} onChange={(e) => update({ max_passes: Number(e.target.value) })} />)}
      {row('Via costs', <input style={s.input} type="number" min={0} value={settings.via_costs} onChange={(e) => update({ via_costs: Number(e.target.value) })} />)}
      {row('Plane via costs', <input style={s.input} type="number" min={0} value={settings.plane_via_costs} onChange={(e) => update({ plane_via_costs: Number(e.target.value) })} />)}
      {row('Ripup costs', <input style={s.input} type="number" min={0} value={settings.start_ripup_costs} onChange={(e) => update({ start_ripup_costs: Number(e.target.value) })} />)}
      {row('Improve threshold', <input style={s.input} type="number" step={0.001} value={settings.improvement_threshold} onChange={(e) => update({ improvement_threshold: Number(e.target.value) })} />)}
      {row('Pref. dir cost', <input style={s.input} type="number" step={0.1} value={settings.default_preferred_direction_trace_cost} onChange={(e) => update({ default_preferred_direction_trace_cost: Number(e.target.value) })} />)}
      {row('Undesired cost', <input style={s.input} type="number" step={0.1} value={settings.default_undesired_direction_trace_cost} onChange={(e) => update({ default_undesired_direction_trace_cost: Number(e.target.value) })} />)}
      {row('Fanout', <input type="checkbox" checked={settings.fanout_enabled} onChange={(e) => update({ fanout_enabled: e.target.checked })} />)}
      {row('Optimizer', <input type="checkbox" checked={settings.optimizer_enabled} onChange={(e) => update({ optimizer_enabled: e.target.checked })} />)}
      <button style={s.reset} onClick={() => update({ ...defaultSettings })}>Reset defaults</button>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  panel: {},
  title: { fontSize: 11, fontWeight: 700, marginBottom: 8, color: '#8fa3bf', textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', fontSize: 11, borderBottom: '1px solid rgba(143, 163, 191, 0.08)' },
  label: { color: '#b0c0d8', marginRight: 8 },
  input: { width: 70, background: '#0f3460', color: '#e0e0e0', border: '1px solid #1c3a5e', borderRadius: 4, padding: '4px 6px', fontSize: 11, outline: 'none' },
  reset: { marginTop: 10, width: '100%', padding: '6px 0', background: '#0f3460', color: '#e0e0e0', border: '1px solid #1c3a5e', borderRadius: 4, fontSize: 11, cursor: 'pointer', fontWeight: 500 },
}
