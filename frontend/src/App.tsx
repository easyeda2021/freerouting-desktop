import { createContext, useContext, useReducer, type Dispatch } from 'react'
import type { BoardData, LogEntry, FRStatusData } from './lib/board-types'
import MenuBar from './components/MenuBar'
import BoardCanvas from './components/BoardCanvas'
import ErrorBoundary from './components/ErrorBoundary'
import SidePanel from './components/SidePanel'
import ProgressPanel from './components/ProgressPanel'
import LogPanel from './components/LogPanel'
import SetupWizard from './components/SetupWizard'

interface AppState {
  frStatus: 'loading' | 'not-installed' | 'ready' | 'error'
  frVersion: string | null
  downloadProgress: number
  sessionId: string | null
  jobId: string | null
  jobState: string
  jobStage: string
  boardData: BoardData | null
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
    case 'ADD_LOG':
      return { ...state, logEntries: [...state.logEntries.slice(-999), action.entry] }
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

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      <div style={styles.container}>
        {state.frStatus !== 'ready' && <SetupWizard />}
        <MenuBar />
        <div style={styles.main}>
          <div style={styles.canvasArea}>
            <ErrorBoundary>
              <BoardCanvas />
            </ErrorBoundary>
            <ProgressPanel />
            <LogPanel />
          </div>
          <SidePanel />
        </div>
      </div>
    </AppContext.Provider>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: '#1a1a2e', color: '#e0e0e0', fontFamily: "'Segoe UI', system-ui, sans-serif" },
  main: { display: 'flex', flex: 1, overflow: 'hidden' },
  canvasArea: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
}
