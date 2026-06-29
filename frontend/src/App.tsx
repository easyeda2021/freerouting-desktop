import { createContext, useContext, useReducer, useEffect, useRef, type Dispatch } from 'react'
import type { BoardData, LogEntry, FRStatusData } from './lib/board-types'
import MenuBar from './components/MenuBar'
import BoardCanvas from './components/BoardCanvas'
import ErrorBoundary from './components/ErrorBoundary'
import SidePanel from './components/SidePanel'
import ProgressPanel from './components/ProgressPanel'
import LogPanel from './components/LogPanel'
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
  currentPass: number
  routedCount: number
  incompleteCount: number
  score: number
  logEntries: LogEntry[]
  layerVisibility: Record<string, boolean>
}

type Action =
  | { type: 'SET_FR_STATUS'; payload: FRStatusData }
  | { type: 'SET_SESSION'; sessionId: string }
  | { type: 'SET_JOB'; jobId: string }
  | { type: 'SET_JOB_STATE'; state: string; stage: string; currentPass: number }
  | { type: 'SET_BOARD_DATA'; data: BoardData }
  | { type: 'MERGE_BOARD_DATA'; data: BoardData }
  | { type: 'SET_DSN_FILE'; fileName: string }
  | { type: 'ADD_LOG'; entry: LogEntry }
  | { type: 'SET_SCORE'; score: number }
  | { type: 'TOGGLE_LAYER'; layer: string }
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
  currentPass: 0,
  routedCount: 0,
  incompleteCount: 0,
  score: 0,
  logEntries: [],
  layerVisibility: {},
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
      }

      const visibility: Record<string, boolean> = {}
      merged.layers.forEach((l) => { visibility[l.name] = state.layerVisibility[l.name] ?? true })
      return { ...state, boardData: merged, layerVisibility: visibility }
    }
    case 'ADD_LOG':
      if (!action.entry || typeof action.entry !== 'object') return state
      return { ...state, logEntries: [...state.logEntries.slice(-999), action.entry] }
    case 'SET_DSN_FILE':
      return { ...state, currentDsn: action.fileName }
    case 'SET_SCORE':
      return { ...state, score: action.score }
    case 'TOGGLE_LAYER':
      return { ...state, layerVisibility: { ...state.layerVisibility, [action.layer]: !state.layerVisibility[action.layer] } }
    case 'RESET':
      return { ...initialState, frStatus: state.frStatus, frVersion: state.frVersion }
    default:
      return state
  }
}

export const AppContext = createContext<{ state: AppState; dispatch: Dispatch<Action> }>({
  state: initialState,
  dispatch: () => {},
})

export function useApp() { return useContext(AppContext) }

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const consoleWinRef = useRef<Window | null>(null)
  const consoleBufferRef = useRef<string[]>([])

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
            <div style={styles.canvasArea}>
              <BoardCanvas />
              <ProgressPanel />
              <LogPanel />
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
