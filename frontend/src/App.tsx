import { createContext, useContext, useReducer, useEffect, useRef, type Dispatch } from 'react'
import type { BoardData, LogEntry, FRStatusData, RoutingSettings, NetInfo, DrcViolation, SelectedObject, Measurement, Lang, DisplayUnit } from './lib/board-types'
import MenuBar from './components/MenuBar'
import BoardCanvas from './components/BoardCanvas'
import ErrorBoundary from './components/ErrorBoundary'
import SidePanel from './components/SidePanel'
import LeftPanel from './components/LeftPanel'
import ProgressPanel from './components/ProgressPanel'
import LogPanel from './components/LogPanel'
import StatusBar from './components/StatusBar'
import SetupWizard from './components/SetupWizard'

function mergeByKey<T>(existing: T[], incoming: T[], key: (item: T) => string): T[] {
  const map = new Map<string, T>()
  for (const item of existing) map.set(key(item), item)
  for (const item of incoming) map.set(key(item), item)
  return Array.from(map.values())
}

interface AppState {
  frStatus: 'loading' | 'not-installed' | 'ready' | 'error'
  frVersion: string | null
  downloadProgress: number
  sessionId: string | null
  jobId: string | null
  jobState: string
  jobStage: string
  boardData: BoardData | null
  currentDsn: string | null
  dsnContent: string | null
  currentPass: number
  routedCount: number
  incompleteCount: number
  score: number
  logEntries: LogEntry[]
  layerVisibility: Record<string, boolean>
  layerColors: Record<string, string>
  routingSettings: RoutingSettings
  nets: NetInfo[]
  selectedNet: string | null
  selectedObject: SelectedObject | null
  drcResults: DrcViolation[]
  recentFiles: string[]
  measurement: Measurement
  panTarget: { x: number; y: number } | null
  fitViewTrigger: number
  displayUnit: DisplayUnit
  language: Lang
}

type Action =
  | { type: 'SET_FR_STATUS'; payload: FRStatusData }
  | { type: 'SET_SESSION'; sessionId: string }
  | { type: 'SET_JOB'; jobId: string }
  | { type: 'SET_JOB_STATE'; state: string; stage: string; currentPass: number }
  | { type: 'SET_BOARD_DATA'; data: BoardData }
  | { type: 'MERGE_BOARD_DATA'; data: BoardData }
  | { type: 'SET_DSN_FILE'; fileName: string }
  | { type: 'SET_DSN_CONTENT'; content: string }
  | { type: 'ADD_LOG'; entry: LogEntry }
  | { type: 'SET_SCORE'; score: number }
  | { type: 'TOGGLE_LAYER'; layer: string }
  | { type: 'SET_LAYER_COLOR'; layer: string; color: string }
  | { type: 'SET_ROUTING_SETTINGS'; settings: RoutingSettings }
  | { type: 'SET_NETS'; nets: NetInfo[] }
  | { type: 'TOGGLE_NET_VISIBILITY'; netName: string }
  | { type: 'SET_NET_PRIORITY'; netName: string; priority: number }
  | { type: 'SELECT_NET'; netName: string | null }
  | { type: 'SELECT_OBJECT'; object: SelectedObject | null }
  | { type: 'SET_DRC_RESULTS'; violations: DrcViolation[] }
  | { type: 'SET_RECENT_FILES'; files: string[] }
  | { type: 'SET_MEASUREMENT'; measurement: Partial<Measurement> }
  | { type: 'SET_PAN_TARGET'; target: { x: number; y: number } | null }
  | { type: 'TRIGGER_FIT_VIEW' }
  | { type: 'SET_DISPLAY_UNIT'; unit: DisplayUnit }
  | { type: 'SET_LANGUAGE'; lang: Lang }
  | { type: 'RESET' }

const initialState: AppState = {
  frStatus: 'loading',
  frVersion: null,
  downloadProgress: 0,
  sessionId: null,
  jobId: null,
  jobState: '',
  jobStage: '',
  boardData: null,
  currentDsn: null,
  dsnContent: null,
  currentPass: 0,
  routedCount: 0,
  incompleteCount: 0,
  score: 0,
  logEntries: [],
  layerVisibility: {},
  layerColors: {},
  routingSettings: {},
  nets: [],
  selectedNet: null,
  selectedObject: null,
  drcResults: [],
  recentFiles: [],
  measurement: { start: null, end: null, cursor: null, active: false },
  panTarget: null,
  fitViewTrigger: 0,
  displayUnit: 'mm',
  language: 'zh',
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_FR_STATUS':
      return {
        ...state,
        frStatus: action.payload.status,
        frVersion: action.payload.version || null,
        downloadProgress: action.payload.progress,
      }
    case 'SET_SESSION':
      return { ...state, sessionId: action.sessionId }
    case 'SET_JOB':
      return { ...state, jobId: action.jobId }
    case 'SET_JOB_STATE':
      return { ...state, jobState: action.state, jobStage: action.stage, currentPass: action.currentPass }
    case 'SET_BOARD_DATA': {
      const visibility: Record<string, boolean> = {}
      action.data.layers.forEach((l) => { visibility[l.name] = state.layerVisibility[l.name] ?? true })
      visibility['ratsnest'] = state.layerVisibility['ratsnest'] ?? true
      return { ...state, boardData: action.data, layerVisibility: visibility }
    }
    case 'MERGE_BOARD_DATA': {
      if (!state.boardData) {
        const visibility: Record<string, boolean> = {}
        action.data.layers.forEach((l) => { visibility[l.name] = true })
        return { ...state, boardData: action.data, layerVisibility: visibility }
      }
      const existing = state.boardData
      const incoming = action.data

      // Preserve original components/images/padstacks and board outline;
      // replace network traces/vias with the routed result.
      const merged: BoardData = {
        resolutionUnit: incoming.resolutionUnit || existing.resolutionUnit,
        resolutionDenominator: incoming.resolutionDenominator || existing.resolutionDenominator,
        layers: mergeByKey(existing.layers, incoming.layers, (l) => l.name),
        traces: [
          ...existing.traces.filter((t) => t.netName === ''),
          ...incoming.traces,
        ],
        vias: incoming.vias.length > 0 ? incoming.vias : existing.vias,
        components: existing.components,
        padstacks: mergeByKey(existing.padstacks, incoming.padstacks, (p) => p.name),
        images: existing.images,
        netPins: existing.netPins,
      }

      const visibility: Record<string, boolean> = {}
      merged.layers.forEach((l) => { visibility[l.name] = state.layerVisibility[l.name] ?? true })
      visibility['ratsnest'] = state.layerVisibility['ratsnest'] ?? true
      return { ...state, boardData: merged, layerVisibility: visibility }
    }
    case 'ADD_LOG':
      if (!action.entry || typeof action.entry !== 'object') return state
      return { ...state, logEntries: [...state.logEntries.slice(-999), action.entry] }
    case 'SET_DSN_FILE':
      return { ...state, currentDsn: action.fileName }
    case 'SET_DSN_CONTENT':
      return { ...state, dsnContent: action.content }
    case 'SET_SCORE':
      return { ...state, score: action.score }
    case 'TOGGLE_LAYER':
      return { ...state, layerVisibility: { ...state.layerVisibility, [action.layer]: !state.layerVisibility[action.layer] } }
    case 'SET_LAYER_COLOR':
      return { ...state, layerColors: { ...state.layerColors, [action.layer]: action.color } }
    case 'SET_ROUTING_SETTINGS':
      return { ...state, routingSettings: { ...state.routingSettings, ...action.settings } }
    case 'SET_NETS':
      return { ...state, nets: action.nets }
    case 'TOGGLE_NET_VISIBILITY':
      return {
        ...state,
        nets: state.nets.map((n) => n.name === action.netName ? { ...n, visible: !n.visible } : n),
      }
    case 'SET_NET_PRIORITY':
      return {
        ...state,
        nets: state.nets.map((n) => n.name === action.netName ? { ...n, priority: action.priority } : n),
      }
    case 'SELECT_NET':
      return { ...state, selectedNet: action.netName }
    case 'SELECT_OBJECT':
      return { ...state, selectedObject: action.object }
    case 'SET_DRC_RESULTS':
      return { ...state, drcResults: action.violations }
    case 'SET_RECENT_FILES':
      return { ...state, recentFiles: Array.isArray(action.files) ? action.files : [] }
    case 'SET_MEASUREMENT':
      return { ...state, measurement: { ...state.measurement, ...action.measurement } }
    case 'SET_PAN_TARGET':
      return { ...state, panTarget: action.target }
    case 'TRIGGER_FIT_VIEW':
      return { ...state, fitViewTrigger: state.fitViewTrigger + 1 }
    case 'SET_DISPLAY_UNIT':
      return { ...state, displayUnit: action.unit }
    case 'SET_LANGUAGE':
      return { ...state, language: action.lang }
    case 'RESET':
      return {
        ...initialState,
        frStatus: state.frStatus,
        frVersion: state.frVersion,
        displayUnit: state.displayUnit,
        language: state.language,
        routingSettings: state.routingSettings,
        recentFiles: state.recentFiles,
      }
    default:
      return state
  }
}

export const AppContext = createContext<{ state: AppState; dispatch: Dispatch<Action> }>({
  state: initialState,
  dispatch: () => {},
})

export function useApp() { return useContext(AppContext) }

export const RECENT_FILES_KEY = 'fr_recent_files'
export const ROUTING_SETTINGS_KEY = 'fr_routing_settings'
export const DISPLAY_UNIT_KEY = 'fr_display_unit'
export const LANGUAGE_KEY = 'fr_language'

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const consoleWinRef = useRef<Window | null>(null)
  const consoleBufferRef = useRef<string[]>([])

  useEffect(() => {
    try {
      const recent = localStorage.getItem(RECENT_FILES_KEY)
      if (recent) dispatch({ type: 'SET_RECENT_FILES', files: JSON.parse(recent) })
    } catch { /* ignore */ }
    try {
      const settings = localStorage.getItem(ROUTING_SETTINGS_KEY)
      if (settings) dispatch({ type: 'SET_ROUTING_SETTINGS', settings: JSON.parse(settings) })
    } catch { /* ignore */ }
    try {
      const unit = localStorage.getItem(DISPLAY_UNIT_KEY)
      if (unit === 'mm' || unit === 'mil') dispatch({ type: 'SET_DISPLAY_UNIT', unit })
    } catch { /* ignore */ }
    try {
      const lang = localStorage.getItem(LANGUAGE_KEY)
      if (lang === 'en' || lang === 'zh') dispatch({ type: 'SET_LANGUAGE', lang })
    } catch { /* ignore */ }
  }, [dispatch])

  useEffect(() => {
    try { localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(state.recentFiles)) } catch { /* ignore */ }
  }, [state.recentFiles])

  useEffect(() => {
    try { localStorage.setItem(ROUTING_SETTINGS_KEY, JSON.stringify(state.routingSettings)) } catch { /* ignore */ }
  }, [state.routingSettings])

  useEffect(() => {
    try { localStorage.setItem(DISPLAY_UNIT_KEY, state.displayUnit) } catch { /* ignore */ }
  }, [state.displayUnit])

  useEffect(() => {
    try { localStorage.setItem(LANGUAGE_KEY, state.language) } catch { /* ignore */ }
  }, [state.language])

  useEffect(() => {
    const original = {
      log: console.log,
      warn: console.warn,
      error: console.error,
    }
    const push = (level: 'log' | 'warn' | 'error', args: unknown[]) => {
      const text = args
        .map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a)))
        .join(' ')
      const line = `[${level.toUpperCase()}] ${text}`
      consoleBufferRef.current.push(line)
      if (consoleBufferRef.current.length > 2000) consoleBufferRef.current.shift()

      const win = consoleWinRef.current
      if (win && !win.closed) {
        const body = win.document.getElementById('log')
        if (body) {
          const div = win.document.createElement('div')
          div.className = level
          div.textContent = line
          body.appendChild(div)
          win.scrollTo(0, body.scrollHeight)
        }
      }
      original[level].apply(console, args)
    }

    console.log = (...args: unknown[]) => push('log', args)
    console.warn = (...args: unknown[]) => push('warn', args)
    console.error = (...args: unknown[]) => push('error', args)

    const openConsole = () => {
      if (consoleWinRef.current && !consoleWinRef.current.closed) {
        consoleWinRef.current.focus()
        return
      }
      const win = window.open('', 'fr-console', 'width=900,height=500,resizable=yes,scrollbars=yes')
      if (!win) return
      consoleWinRef.current = win
      win.document.write(
        `<html><head><title>Console</title>` +
        `<style>` +
        `body{background:#0a0a1a;color:#e0e0e0;font:12px monospace;margin:0;padding:8px;white-space:pre-wrap;}` +
        `.error{color:#ff6b6b}.warn{color:#f5a623}` +
        `</style></head><body id="log"></body></html>`
      )
      win.document.close()
      const body = win.document.getElementById('log')
      if (body) {
        for (const line of consoleBufferRef.current) {
          const div = win.document.createElement('div')
          div.className = line.startsWith('[ERROR]') ? 'error' : line.startsWith('[WARN]') ? 'warn' : ''
          div.textContent = line
          body.appendChild(div)
        }
        win.scrollTo(0, body.scrollHeight)
      }
      win.addEventListener('beforeunload', () => { consoleWinRef.current = null })
    }

    const handleError = (e: ErrorEvent) => {
      console.error(e.message, e.filename, e.lineno, e.colno, e.error)
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'F12') {
        e.preventDefault()
        openConsole()
      }
    }

    window.addEventListener('error', handleError)
    window.addEventListener('keydown', handleKey)

    return () => {
      console.log = original.log
      console.warn = original.warn
      console.error = original.error
      window.removeEventListener('error', handleError)
      window.removeEventListener('keydown', handleKey)
    }
  }, [])

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      <div style={styles.container}>
        {state.frStatus !== 'ready' && <SetupWizard />}
        <MenuBar />
        <ErrorBoundary>
          <div style={styles.main}>
            <LeftPanel />
            <div style={styles.canvasArea}>
              <BoardCanvas />
              <ProgressPanel />
              <LogPanel />
              <StatusBar />
            </div>
            <SidePanel />
          </div>
        </ErrorBoundary>
      </div>
    </AppContext.Provider>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: '#1a1a2e', color: '#e0e0e0', fontFamily: "'Segoe UI', system-ui, sans-serif" },
  main: { display: 'flex', flex: 1, overflow: 'hidden' },
  canvasArea: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
}
