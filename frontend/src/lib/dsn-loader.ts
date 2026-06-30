import type { Dispatch } from 'react'
import type { Action } from '../App'
import { parseDsn } from './dsn-parser'
import { createSession, createJob, uploadDsn } from './api'

const RECENT_FILES_KEY = 'fr_recent_files'

function log(dispatch: Dispatch<Action>, type: 'Info' | 'Warn' | 'Error', message: string, topic = 'App') {
  dispatch({ type: 'ADD_LOG', entry: { timestamp: new Date().toISOString(), type, message, topic } })
}

export async function loadDsnFromContent(
  dispatch: Dispatch<Action>,
  content: string,
  fileName: string,
  fullPath?: string,
) {
  try { localStorage.setItem('last_dsn_file', fileName) } catch { /* ignore */ }

  dispatch({ type: 'RESET' })
  log(dispatch, 'Info', `Loading design: ${fileName}`)

  if (fullPath) {
    try {
      const raw = localStorage.getItem(RECENT_FILES_KEY)
      const list: string[] = raw ? JSON.parse(raw) : []
      const next = [fullPath, ...list.filter((p) => p !== fullPath)].slice(0, 10)
      localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(next))
      dispatch({ type: 'SET_RECENT_FILES', files: next })
    } catch (err) {
      console.error('[recentFiles] failed to add', fullPath, err)
    }
  }

  const initialBoard = parseDsn(content)
  dispatch({ type: 'SET_BOARD_DATA', data: initialBoard })
  dispatch({ type: 'SET_DSN_FILE', fileName })
  dispatch({ type: 'SET_DSN_CONTENT', content })
  log(dispatch, 'Info', `Parsed DSN: ${initialBoard.components.length} components, ${initialBoard.traces.length} traces, ${initialBoard.vias.length} vias`)

  log(dispatch, 'Info', 'Creating FreeRouting session...')
  const session = await createSession()
  dispatch({ type: 'SET_SESSION', sessionId: session.id })
  log(dispatch, 'Info', `Session created: ${session.id}`)

  const job = await createJob(session.id)
  dispatch({ type: 'SET_JOB', jobId: job.id })
  log(dispatch, 'Info', `Job enqueued: ${job.id}`)

  log(dispatch, 'Info', 'Uploading DSN to backend...')
  await uploadDsn(job.id, fileName, content)
  log(dispatch, 'Info', 'DSN uploaded. Ready to route.')
}
