import { useRef, type ChangeEvent } from 'react'
import { useApp } from '../App'
import { createSession, createJob, uploadDsn, startRouting, cancelRouting, streamLogs, streamOutput, getJobOutput, getJobStatus } from '../lib/api'
import { parseSes } from '../lib/ses-parser'
import { parseDsn } from '../lib/dsn-parser'
import type { LogEntry } from '../lib/board-types'

declare global {
  interface Window {
    checkFreeRoutingStatus: () => string
    selectFreeRoutingPath: () => string
    startFreeRouting: () => string
    stopFreeRouting: () => void
    openURL: (url: string) => void
    openFileDialog: () => string
    readFile: (path: string) => string
  }
}

export default function MenuBar() {
  const { state, dispatch } = useApp()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const outputFetchedRef = useRef(false)

  const log = (type: 'Info' | 'Warn' | 'Error', message: string, topic = 'App') => {
    dispatch({ type: 'ADD_LOG', entry: { timestamp: new Date().toISOString(), type, message, topic } })
  }

  const setupRoutingStreams = (jobId: string) => {
    streamLogs(jobId, (entry) => {
      dispatch({ type: 'ADD_LOG', entry: entry as LogEntry })
      const match = entry.message.match(/score of ([\d.]+)/i)
      if (match) dispatch({ type: 'SET_SCORE', score: parseFloat(match[1]) })
    })

    let sesBuffer = ''
    streamOutput(jobId, (data) => {
      try {
        let base64 = data
        if (data.trimStart().startsWith('{')) {
          const parsed = JSON.parse(data)
          base64 = parsed.data || parsed.output || parsed.ses || ''
        }
        if (!base64) return
        sesBuffer += base64
        const sesContent = atob(sesBuffer)
        const boardData = parseSes(sesContent)
        dispatch({ type: 'MERGE_BOARD_DATA', data: boardData })
        sesBuffer = ''
      } catch {
        if (sesBuffer.length > 5_000_000) sesBuffer = ''
      }
    })

    const poll = setInterval(async () => {
      try {
        const status = await getJobStatus(jobId)
        dispatch({ type: 'SET_JOB_STATE', state: status.state, stage: status.stage || '', currentPass: status.current_pass || 0 })
        if (status.state === 'COMPLETED' && !outputFetchedRef.current) {
          outputFetchedRef.current = true
          try {
            const output = await getJobOutput(jobId)
            const sesContent = atob(output.data)
            const boardData = parseSes(sesContent)
            dispatch({ type: 'MERGE_BOARD_DATA', data: boardData })
            log('Info', 'Final routing output merged')
          } catch (err) {
            console.error('Failed to fetch final SES output:', err)
          }
        }
        if (status.state === 'COMPLETED' || status.state === 'CANCELLED') clearInterval(poll)
      } catch { /* ignore */ }
    }, 2000)
  }

  const loadDsnFromContent = async (content: string, fileName: string) => {
    outputFetchedRef.current = false
    try { localStorage.setItem('last_dsn_file', fileName) } catch { /* ignore */ }

    dispatch({ type: 'RESET' })
    log('Info', `Loading design: ${fileName}`)

    const initialBoard = parseDsn(content)
    dispatch({ type: 'SET_BOARD_DATA', data: initialBoard })
    dispatch({ type: 'SET_DSN_FILE', fileName })
    log('Info', `Parsed DSN: ${initialBoard.components.length} components, ${initialBoard.traces.length} traces, ${initialBoard.vias.length} vias`)

    log('Info', 'Creating FreeRouting session...')
    const session = await createSession()
    dispatch({ type: 'SET_SESSION', sessionId: session.id })
    log('Info', `Session created: ${session.id}`)

    const job = await createJob(session.id)
    dispatch({ type: 'SET_JOB', jobId: job.id })
    log('Info', `Job enqueued: ${job.id}`)

    log('Info', 'Uploading DSN to backend...')
    await uploadDsn(job.id, fileName, content)
    log('Info', 'DSN uploaded. Ready to route.')
  }

  const handleStartRouting = async () => {
    if (!state.jobId) return
    log('Info', 'Starting autorouting...')
    try {
      await startRouting(state.jobId)
      log('Info', 'Autorouting started')
      setupRoutingStreams(state.jobId)
    } catch (err) {
      log('Error', `Failed to start routing: ${err}`)
    }
  }

  const handleStopRouting = async () => {
    if (!state.jobId) return
    log('Info', 'Stopping autorouting...')
    try {
      await cancelRouting(state.jobId)
      log('Info', 'Stop request sent')
    } catch (err) {
      log('Error', `Failed to stop routing: ${err}`)
    }
  }

  const handleOpenDsn = async () => {
    let path: string
    try {
      path = await window.openFileDialog()
    } catch (err) {
      console.error('Native file dialog failed, falling back to HTML input:', err)
      fileInputRef.current?.click()
      return
    }
    if (!path) {
      // User cancelled native dialog; use HTML fallback
      fileInputRef.current?.click()
      return
    }
    const content = window.readFile(path)
    if (!content) {
      log('Error', `Failed to read file: ${path}`)
      return
    }
    try {
      const fileName = path.replace(/\\/g, '/').split('/').pop() || 'board.dsn'
      await loadDsnFromContent(content, fileName)
    } catch (err) {
      log('Error', `Failed to load DSN: ${err}`)
    }
  }

  const handleFileInputChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const content = await file.text()
      if (!content) return
      await loadDsnFromContent(content, file.name)
    } catch (err) {
      console.error('Failed to read selected file:', err)
      dispatch({ type: 'ADD_LOG', entry: { timestamp: new Date().toISOString(), type: 'Error', message: String(err), topic: 'App' } })
    }
  }

  const handleExportSes = async () => {
    if (!state.jobId) return
    try {
      const output = await getJobOutput(state.jobId)
      const sesContent = atob(output.data)
      const baseName = state.currentDsn ? state.currentDsn.replace(/\.dsn$/i, '') : 'output'
      const fileName = `${baseName}.ses`
      // Use Blob download (triggers native Save As in WebView2)
      const blob = new Blob([sesContent], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      dispatch({ type: 'ADD_LOG', entry: { timestamp: new Date().toISOString(), type: 'Error', message: String(err), topic: 'App' } })
    }
  }

  return (
    <>
      <input
        type="file"
        accept=".dsn,.ses"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        style={{ display: 'none' }}
      />
      <div style={s.bar}>
        <div style={s.left}>
          <button style={s.btn} onClick={handleOpenDsn} disabled={state.frStatus !== 'ready'}>
            Open DSN
          </button>
          {state.jobState === 'RUNNING' ? (
            <button style={s.btn} onClick={handleStopRouting}>
              Stop Routing
            </button>
          ) : (
            <button style={s.btn} onClick={handleStartRouting} disabled={!state.jobId}>
              Route
            </button>
          )}
          <button style={s.btn} onClick={handleExportSes} disabled={!state.jobId}>
            Export SES
          </button>
        </div>
        <span style={s.fileName}>{state.currentDsn || ''}</span>
      </div>
    </>
  )
}

const s: Record<string, React.CSSProperties> = {
  bar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 40, padding: '0 12px', background: '#16213e', borderBottom: '1px solid #0f3460', flexShrink: 0 },
  left: { display: 'flex', alignItems: 'center', gap: 8 },
  btn: { padding: '5px 16px', border: '1px solid #4a5568', borderRadius: 4, background: '#0f3460', color: '#e0e0e0', cursor: 'pointer', fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap' },
  fileName: { fontSize: 12, color: '#e0e0e0', fontWeight: 500, marginLeft: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
}
