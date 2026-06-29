import { useRef } from 'react'
import { useApp } from '../App'
import { createSession, createJob, uploadDsn, startRouting, streamLogs, streamOutput, getJobOutput, getJobStatus } from '../lib/api'
import { parseSes } from '../lib/ses-parser'
import type { LogEntry } from '../lib/board-types'

declare global {
  interface Window {
    checkFreeRoutingStatus: () => string
    selectFreeRoutingPath: () => string
    startFreeRouting: () => string
    stopFreeRouting: () => void
    openURL: (url: string) => void
    saveFileDialog: (name: string) => string
    readFile: (path: string) => string
    writeFile: (path: string, data: string) => string
  }
}

export default function MenuBar() {
  const { state, dispatch } = useApp()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleOpenDsn = async () => {
    fileInputRef.current?.click()
  }

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = '' // allow re-selecting the same file
    try {
      const content = await file.text()
      if (!content) return

      const session = await createSession()
      dispatch({ type: 'SET_SESSION', sessionId: session.id })

      const job = await createJob(session.id)
      dispatch({ type: 'SET_JOB', jobId: job.id })

      await uploadDsn(job.id, file.name, content)
      await startRouting(job.id)

      streamLogs(job.id, (log) => {
        dispatch({ type: 'ADD_LOG', entry: log as LogEntry })
        const match = log.message.match(/score of ([\d.]+)/i)
        if (match) dispatch({ type: 'SET_SCORE', score: parseFloat(match[1]) })
      })

      streamOutput(job.id, (base64Data) => {
        try {
          const sesContent = atob(base64Data)
          const boardData = parseSes(sesContent)
          dispatch({ type: 'SET_BOARD_DATA', data: boardData })
        } catch { /* partial data */ }
      })

      const poll = setInterval(async () => {
        try {
          const status = await getJobStatus(job.id)
          dispatch({ type: 'SET_JOB_STATE', state: status.state, stage: status.stage || '', currentPass: status.current_pass || 0 })
          if (status.state === 'COMPLETED' || status.state === 'CANCELLED') clearInterval(poll)
        } catch { /* ignore */ }
      }, 2000)
    } catch (err) {
      dispatch({ type: 'ADD_LOG', entry: { timestamp: new Date().toISOString(), type: 'Error', message: String(err), topic: 'App' } })
    }
  }

  const handleExportSes = async () => {
    if (!state.jobId) return
    try {
      const output = await getJobOutput(state.jobId)
      const sesContent = atob(output.data)
      const path = await window.saveFileDialog(output.filename || 'output.ses')
      if (path) await window.writeFile(path, sesContent)
    } catch (err) {
      dispatch({ type: 'ADD_LOG', entry: { timestamp: new Date().toISOString(), type: 'Error', message: String(err), topic: 'App' } })
    }
  }

  return (
    <div style={s.bar}>
      <span style={s.brand}>FreeRouting Desktop</span>
      <div style={s.menu}>
        <input ref={fileInputRef} type="file" accept=".dsn" style={{ display: 'none' }} onChange={onFileSelected} />
        <button style={s.btn} onClick={handleOpenDsn} disabled={state.frStatus !== 'ready'}>
          Open DSN
        </button>
        <button style={s.btn} onClick={handleExportSes} disabled={!state.jobId}>
          Export SES
        </button>
        <span style={s.status}>
          FR: {state.frStatus === 'ready' ? `v${state.frVersion || '?'}` : state.frStatus}
        </span>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  bar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 40, padding: '0 12px', background: '#16213e', borderBottom: '1px solid #0f3460', flexShrink: 0 },
  brand: { fontWeight: 700, fontSize: 14, color: '#e94560' },
  menu: { display: 'flex', alignItems: 'center', gap: 8 },
  btn: { padding: '4px 12px', border: '1px solid #0f3460', borderRadius: 4, background: '#1a1a2e', color: '#e0e0e0', cursor: 'pointer', fontSize: 12 },
  status: { fontSize: 11, color: '#888', marginLeft: 16 },
}
