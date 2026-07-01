import { createContext, useContext, useReducer, useEffect, type Dispatch } from 'react'
import type { BoardData, LogEntry, FRStatusData, RoutingSettings, NetInfo, DrcViolation, SelectedObject, Measurement, Lang, DisplayUnit } from './lib/board-types'
import { getDefaultLayerColor } from './lib/layer-colors'
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

export type Action =
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

      const layerColors: Record<string, string> = { ...state.layerColors }
      action.data.layers.forEach((l) => {
        if (!layerColors[l.name]) layerColors[l.name] = getDefaultLayerColor(l.name, l.index)
      })
      if (!layerColors['ratsnest']) layerColors['ratsnest'] = '#00bfff'

      return { ...state, boardData: action.data, layerVisibility: visibility, layerColors }
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

      const layerColors: Record<string, string> = { ...state.layerColors }
      merged.layers.forEach((l) => {
        if (!layerColors[l.name]) layerColors[l.name] = getDefaultLayerColor(l.name, l.index)
      })
      if (!layerColors['ratsnest']) layerColors['ratsnest'] = '#00bfff'

      return { ...state, boardData: merged, layerVisibility: visibility, layerColors }
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

  useEffect(() => {
    try {
      const recent = localStorage.getItem(RECENT_FILES_KEY)
      console.log('[App init] localStorage recent raw:', recent)
      if (recent) {
        const list = JSON.parse(recent)
        console.log('[App init] parsed recent files:', list.length, list)
        dispatch({ type: 'SET_RECENT_FILES', files: list })
      } else {
        console.log('[App init] no recent files in localStorage')
      }
    } catch (err) {
      console.error('[App init] failed to load recent files', err)
    }
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
    try {
      const data = JSON.stringify(state.recentFiles)
      localStorage.setItem(RECENT_FILES_KEY, data)
      console.log('[App save] recent files saved:', state.recentFiles.length, state.recentFiles)
    } catch (err) {
      console.error('[App save] failed to save recent files', err)
    }
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
