import { useRef, useState, useEffect, type ChangeEvent } from 'react'
import { useApp, RECENT_FILES_KEY, ROUTING_SETTINGS_KEY } from '../App'
import { createSession, createJob, uploadDsn, startRouting, cancelRouting, setJobSettings, getDrcResults, streamLogs, streamOutput, getJobOutput, getJobStatus } from '../lib/api'
import { parseSes } from '../lib/ses-parser'
import { parseDsn } from '../lib/dsn-parser'
import type { BoardData, LogEntry, DrcViolation } from '../lib/board-types'
import { t } from '../lib/i18n'

function parseDrcResponse(data: unknown): DrcViolation[] {
  if (!data || typeof data !== 'object') return []
  const violations: DrcViolation[] = []
  const list = (data as any).violations || (Array.isArray(data) ? data : [])
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    violations.push({
      type: String(item.type || item.rule || 'violation'),
      message: String(item.message || item.description || ''),
      netName: item.net_name ? String(item.net_name) : undefined,
      layer: item.layer ? String(item.layer) : undefined,
      x: Number(item.x ?? item.location?.[0] ?? 0),
      y: Number(item.y ?? item.location?.[1] ?? 0),
    })
  }
  return violations
}

declare global {
  interface Window {
    checkFreeRoutingStatus: () => string
    selectFreeRoutingPath: () => string
    startFreeRouting: () => string
    stopFreeRouting: () => void
    openURL: (url: string) => void
    openFileDialog: () => Promise<string> | string
    readFile: (path: string) => Promise<string> | string
  }
}

export default function MenuBar() {
  const { state, dispatch } = useApp()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const outputFetchedRef = useRef(false)
  const pendingMergeRef = useRef<BoardData | null>(null)
  const mergeTimerRef = useRef<number | null>(null)
  const jobStartedRef = useRef(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [recentOpen, setRecentOpen] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_FILES_KEY)
      if (raw) dispatch({ type: 'SET_RECENT_FILES', files: JSON.parse(raw) })
    } catch { /* ignore */ }
    try {
      const raw = localStorage.getItem(ROUTING_SETTINGS_KEY)
      if (raw) dispatch({ type: 'SET_ROUTING_SETTINGS', settings: JSON.parse(raw) })
    } catch { /* ignore */ }
  }, [dispatch])

  useEffect(() => {
    if (!recentOpen) return
    const onMouseDown = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setRecentOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [recentOpen])

  const log = (type: 'Info' | 'Warn' | 'Error', message: string, topic = 'App') => {
    dispatch({ type: 'ADD_LOG', entry: { timestamp: new Date().toISOString(), type, message, topic } })
  }

  const setupRoutingStreams = (jobId: string) => {
    streamLogs(jobId, (entry) => {
      dispatch({ type: 'ADD_LOG', entry: entry as LogEntry })
      const match = entry.message.match(/score of ([\d.]+)/i)
      if (match) dispatch({ type: 'SET_SCORE', score: parseFloat(match[1]) })
    })

    const flushMerge = () => {
      mergeTimerRef.current = null
      if (pendingMergeRef.current) {
        dispatch({ type: 'MERGE_BOARD_DATA', data: pendingMergeRef.current })
        pendingMergeRef.current = null
      }
    }

    const scheduleMerge = (data: BoardData) => {
      pendingMergeRef.current = data
      if (mergeTimerRef.current) return
      mergeTimerRef.current = window.setTimeout(flushMerge, 500)
    }

    // Stream output updates as soon as they are available
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
        console.log(`[streamOutput] parsed ${boardData.traces.length} traces, ${boardData.vias.length} vias`)
        scheduleMerge(boardData)
        sesBuffer = ''
      } catch (err) {
        console.log('[streamOutput] incomplete chunk, accumulating...', err)
        if (sesBuffer.length > 5_000_000) sesBuffer = ''
      }
    })

    const fetchAndMergeOutput = async (label: string) => {
      try {
        const output = await getJobOutput(jobId)
        if (!output.data) return
        const sesContent = atob(output.data)
        const boardData = parseSes(sesContent)
        console.log(`[${label}] fetched ${boardData.traces.length} traces, ${boardData.vias.length} vias`)
        dispatch({ type: 'MERGE_BOARD_DATA', data: boardData })
      } catch (err) {
        console.error(`[${label}] failed to fetch/parse output:`, err)
      }
    }

    // Poll job status every 2s; fetch final output immediately when completed
    const poll = setInterval(async () => {
      try {
        const status = await getJobStatus(jobId)
        dispatch({ type: 'SET_JOB_STATE', state: status.state, stage: status.stage || '', currentPass: status.current_pass || 0 })
        if (status.state === 'COMPLETED' && !outputFetchedRef.current) {
          outputFetchedRef.current = true
          if (mergeTimerRef.current) {
            clearTimeout(mergeTimerRef.current)
            flushMerge()
          }
          await fetchAndMergeOutput('finalOutput')
          log('Info', 'Final routing output merged')

          try {
            const drc = await getDrcResults(jobId)
            const violations = parseDrcResponse(drc)
            dispatch({ type: 'SET_DRC_RESULTS', violations })
            log('Info', `DRC completed: ${violations.length} violations`)
          } catch (err) {
            console.error('DRC check failed:', err)
          }
        }
        if (status.state === 'COMPLETED' || status.state === 'CANCELLED') {
          clearInterval(poll)
          clearInterval(outputPoll)
        }
      } catch { /* ignore */ }
    }, 2000)

    // Poll routing output every 5s during routing to refresh canvas progress
    const outputPoll = setInterval(async () => {
      if (outputFetchedRef.current) return
      await fetchAndMergeOutput('periodicOutput')
    }, 5000)
  }

  const loadDsnFromContent = async (content: string, fileName: string, fullPath?: string) => {
    outputFetchedRef.current = false
    pendingMergeRef.current = null
    jobStartedRef.current = false
    if (mergeTimerRef.current) {
      clearTimeout(mergeTimerRef.current)
      mergeTimerRef.current = null
    }
    try { localStorage.setItem('last_dsn_file', fileName) } catch { /* ignore */ }
    if (fullPath) {
      try {
        const raw = localStorage.getItem(RECENT_FILES_KEY)
        const list: string[] = raw ? JSON.parse(raw) : []
        const next = [fullPath, ...list.filter((p) => p !== fullPath)].slice(0, 10)
        localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(next))
        dispatch({ type: 'SET_RECENT_FILES', files: next })
      } catch { /* ignore */ }
    }

    dispatch({ type: 'RESET' })
    log('Info', `Loading design: ${fileName}`)

    const initialBoard = parseDsn(content)
    dispatch({ type: 'SET_BOARD_DATA', data: initialBoard })
    dispatch({ type: 'SET_DSN_FILE', fileName })
    dispatch({ type: 'SET_DSN_CONTENT', content })
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

  const startRoutingOnJob = async (jobId: string) => {
    const settings = state.routingSettings
    const hasSettings = settings && Object.keys(settings).length > 0
    if (hasSettings) {
      await setJobSettings(jobId, settings)
      log('Info', `Applied routing settings: ${JSON.stringify(settings)}`)
    }
    await startRouting(jobId)
    jobStartedRef.current = true
    log('Info', 'Autorouting started')
    setupRoutingStreams(jobId)
  }

  const handleStartRouting = async () => {
    if (!state.sessionId || !state.dsnContent || !state.currentDsn) return
    log('Info', 'Starting autorouting...')
    try {
      let jobId = state.jobId
      if (!jobId || jobStartedRef.current) {
        // Existing job is already started/completed; enqueue a fresh job in the same session
        outputFetchedRef.current = false
        pendingMergeRef.current = null
        if (mergeTimerRef.current) {
          clearTimeout(mergeTimerRef.current)
          mergeTimerRef.current = null
        }
        const initialBoard = parseDsn(state.dsnContent)
        dispatch({ type: 'SET_BOARD_DATA', data: initialBoard })
        dispatch({ type: 'SET_SCORE', score: 0 })
        dispatch({ type: 'SET_DRC_RESULTS', violations: [] })
        dispatch({ type: 'SELECT_NET', netName: null })
        dispatch({ type: 'SELECT_OBJECT', object: null })

        const job = await createJob(state.sessionId)
        jobId = job.id
        dispatch({ type: 'SET_JOB', jobId })
        log('Info', `New job enqueued: ${jobId}`)

        await uploadDsn(jobId, state.currentDsn, state.dsnContent)
        log('Info', 'DSN uploaded to new job. Ready to route.')
      }
      if (!jobId) return
      await startRoutingOnJob(jobId)
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
    const content = await window.readFile(path)
    if (!content) {
      log('Error', `Failed to read file: ${path}`)
      return
    }
    try {
      const fileName = path.replace(/\\/g, '/').split('/').pop() || 'board.dsn'
      await loadDsnFromContent(content, fileName, path)
    } catch (err) {
      log('Error', `Failed to load DSN: ${err}`)
    }
  }

  const handleRecentFile = async (path: string) => {
    setRecentOpen(false)
    const content = await window.readFile(path)
    if (!content) {
      log('Error', `Failed to read file: ${path}`)
      return
    }
    const fileName = path.replace(/\\/g, '/').split('/').pop() || 'board.dsn'
    try {
      await loadDsnFromContent(content, fileName, path)
    } catch (err) {
      log('Error', `Failed to load DSN: ${err}`)
    }
  }

  const toggleMeasurement = () => {
    dispatch({
      type: 'SET_MEASUREMENT',
      measurement: { active: !state.measurement.active, start: null, end: null },
    })
  }

  const toggleUnit = () => {
    dispatch({ type: 'SET_DISPLAY_UNIT', unit: state.displayUnit === 'mm' ? 'mil' : 'mm' })
  }

  const toggleLanguage = () => {
    dispatch({ type: 'SET_LANGUAGE', lang: state.language === 'zh' ? 'en' : 'zh' })
  }

  const handleFitView = () => {
    dispatch({ type: 'TRIGGER_FIT_VIEW' })
  }

  const handleFileInputChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const content = await file.text()
      if (!content) return
      await loadDsnFromContent(content, file.name, undefined)
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

  const recentFiles = Array.isArray(state.recentFiles) ? state.recentFiles : []

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
          <div ref={dropdownRef} style={s.dropdownContainer}>
            <button style={s.openBtn} onClick={handleOpenDsn} disabled={state.frStatus !== 'ready'}>
              {t('openDsn', state.language)}
            </button>
            <button
              style={s.dropdownToggle}
              onClick={() => setRecentOpen((v) => !v)}
              disabled={state.frStatus !== 'ready'}
              title={t('recentFiles', state.language)}
            >
              ▼
            </button>
            {recentOpen && (
              <div style={s.dropdownMenu}>
                {recentFiles.length === 0 ? (
                  <div style={s.dropdownEmpty}>{t('noRecentFiles', state.language)}</div>
                ) : (
                  recentFiles.map((path) => {
                    const safePath = String(path)
                    const name = safePath.replace(/\\/g, '/').split('/').pop() || safePath
                    return (
                      <div
                        key={safePath}
                        style={s.dropdownItem}
                        title={safePath}
                        onClick={() => handleRecentFile(safePath)}
                      >
                        {name}
                      </div>
                    )
                  })
                )}
              </div>
            )}
          </div>
          <button style={s.btn} onClick={handleExportSes} disabled={!state.jobId}>
            {t('exportSes', state.language)}
          </button>
          {state.jobState === 'RUNNING' ? (
            <button style={s.btn} onClick={handleStopRouting}>
              {t('stopRouting', state.language)}
            </button>
          ) : (
            <button style={s.btn} onClick={handleStartRouting} disabled={!state.jobId}>
              {t('startRoute', state.language)}
            </button>
          )}
          <button
            style={s.btn}
            onClick={toggleMeasurement}
            title={t('measure', state.language)}
          >
            {t('measure', state.language)}
          </button>
          <button style={s.btn} onClick={handleFitView}>{t('fitView', state.language)}</button>
        </div>
        <span style={s.fileName}>{state.currentDsn || ''}</span>
        <div style={s.right}>
          <button style={s.toggleBtn} onClick={toggleUnit}>{state.displayUnit.toUpperCase()}</button>
          <button style={s.toggleBtn} onClick={toggleLanguage}>{state.language === 'zh' ? '中' : 'EN'}</button>
        </div>
      </div>
    </>
  )
}

const s: Record<string, React.CSSProperties> = {
  bar: { position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 40, padding: '0 12px', background: '#16213e', borderBottom: '1px solid #0f3460', flexShrink: 0 },
  left: { display: 'flex', alignItems: 'center', gap: 8 },
  btn: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: 28, padding: '0 16px', border: '1px solid #4a5568', borderRadius: 4, background: '#0f3460', color: '#e0e0e0', cursor: 'pointer', fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap' },
  activeBtn: { background: '#e94560', borderColor: '#e94560' },
  fileName: { position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', maxWidth: '40%', height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#e0e0e0', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  right: { display: 'flex', alignItems: 'center', gap: 8 },
  toggleBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: 28, padding: '0 10px', border: '1px solid #4a5568', borderRadius: 4, background: '#0f3460', color: '#e0e0e0', cursor: 'pointer', fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap' },
  dropdownContainer: { position: 'relative', display: 'flex', alignItems: 'stretch' },
  openBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: 28, padding: '0 12px', border: '1px solid #4a5568', borderRadius: '4px 0 0 4px', background: '#0f3460', color: '#e0e0e0', cursor: 'pointer', fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap' },
  dropdownToggle: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 28, border: '1px solid #4a5568', borderLeft: 'none', borderRadius: '0 4px 4px 0', background: '#0f3460', color: '#e0e0e0', cursor: 'pointer', fontSize: 10, fontWeight: 500 },
  dropdownMenu: { position: 'absolute', top: '100%', left: 0, marginTop: 4, minWidth: 220, maxWidth: 320, background: '#16213e', border: '1px solid #0f3460', borderRadius: 4, zIndex: 100, maxHeight: 300, overflowY: 'auto' },
  dropdownItem: { padding: '6px 10px', fontSize: 11, color: '#ccc', cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  dropdownEmpty: { padding: '6px 10px', fontSize: 11, color: '#888', fontStyle: 'italic' },
}
