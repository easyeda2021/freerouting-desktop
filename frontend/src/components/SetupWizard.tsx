import { useEffect, useState } from 'react'
import { useApp } from '../App'

export default function SetupWizard() {
  const { state, dispatch } = useApp()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function check() {
      try {
        const raw = window.checkFRStatus()
        const status = JSON.parse(raw)
        dispatch({ type: 'SET_FR_STATUS', payload: status })

        if (status.status === 'not-installed') {
          window.downloadFR()

          const poll = setInterval(() => {
            const s = JSON.parse(window.checkFRStatus())
            dispatch({ type: 'SET_FR_STATUS', payload: s })
            if (s.status === 'ready') {
              clearInterval(poll)
              startFRProcess()
            }
            if (s.status === 'error') {
              clearInterval(poll)
              setError(s.message || 'Download failed')
            }
          }, 500)
        } else if (status.status === 'ready') {
          startFRProcess()
        } else if (status.status === 'error') {
          setError(status.message || 'Unknown error')
        }
      } catch (err) {
        setError(String(err))
      }
    }
    check()
  }, [])

  const startFRProcess = () => {
    const err = window.startFR()
    if (err) {
      setError(err)
    } else {
      const poll = setInterval(async () => {
        try {
          const res = await fetch('http://127.0.0.1:9080/v1/system/status')
          if (res.ok) {
            const s = JSON.parse(window.checkFRStatus())
            dispatch({ type: 'SET_FR_STATUS', payload: s })
            clearInterval(poll)
          }
        } catch { /* still starting */ }
      }, 1000)
    }
  }

  const { frStatus, downloadProgress } = state

  return (
    <div style={s.overlay}>
      <div style={s.modal}>
        <h2 style={s.title}>FreeRouting Desktop</h2>

        {frStatus === 'loading' && <p style={s.text}>Initializing...</p>}

        {(frStatus === 'not-installed' || frStatus === 'downloading') && (
          <>
            <p style={s.text}>FreeRouting not found. Downloading...</p>
            <div style={s.progressBar}>
              <div style={{ ...s.progressFill, width: `${downloadProgress}%` }} />
            </div>
            <p style={s.progressText}>{downloadProgress}%</p>
          </>
        )}

        {frStatus === 'installing' && (
          <p style={s.text}>Installing FreeRouting...</p>
        )}

        {error && (
          <div style={s.error}>
            <p>Error: {error}</p>
            <button style={s.retryBtn} onClick={() => window.downloadFR()}>
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    background: '#16213e',
    borderRadius: 12,
    padding: '40px 48px',
    textAlign: 'center' as const,
    minWidth: 400,
    border: '1px solid #0f3460',
  },
  title: { color: '#e94560', marginBottom: 24, fontSize: 20 },
  text: { color: '#aaa', marginBottom: 16, fontSize: 14 },
  progressBar: { height: 6, background: '#0f3460', borderRadius: 3, overflow: 'hidden', marginBottom: 8 },
  progressFill: { height: '100%', background: '#e94560', transition: 'width 0.3s' },
  progressText: { color: '#888', fontSize: 12 },
  error: { marginTop: 16 },
  retryBtn: {
    marginTop: 8,
    padding: '6px 20px',
    border: '1px solid #0f3460',
    borderRadius: 4,
    background: '#e94560',
    color: '#fff',
    cursor: 'pointer',
  },
}
