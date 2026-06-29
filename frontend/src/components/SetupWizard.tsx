import { useEffect, useState } from 'react'
import { useApp } from '../App'

async function getFreeRoutingStatus() {
  const raw = await window.checkFreeRoutingStatus()
  return JSON.parse(raw)
}

export default function SetupWizard() {
  const { state, dispatch } = useApp()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function check() {
      try {
        const status = await getFreeRoutingStatus()
        if (cancelled) return
        dispatch({ type: 'SET_FR_STATUS', payload: status })
        if (status.status === 'ready') startFreeRoutingProcess()
      } catch (err) {
        setError(String(err))
      }
    }
    check()
    return () => { cancelled = true }
  }, [])

  const handleSelectFreeRouting = async () => {
    const path = await window.selectFreeRoutingPath()
    if (path) {
      const s = await getFreeRoutingStatus()
      dispatch({ type: 'SET_FR_STATUS', payload: s })
      if (s.status === 'ready') startFreeRoutingProcess()
    }
  }

  const startFreeRoutingProcess = async () => {
    const err = await window.startFreeRouting()
    if (err) {
      setError(err)
    } else {
      const poll = setInterval(async () => {
        try {
          const res = await fetch('http://127.0.0.1:9080/v1/system/status')
          if (res.ok) {
            // Also fetch version from FR API
            const verRes = await fetch('http://127.0.0.1:9080/v1/system/version')
            let version = ''
            if (verRes.ok) {
              const verData = await verRes.json()
              version = verData.version || ''
            }
            dispatch({ type: 'SET_FR_STATUS', payload: { status: 'ready', version, progress: 0 } })
            clearInterval(poll)
          }
        } catch { /* still starting */ }
      }, 1000)
    }
  }

  return (
    <div style={s.overlay}>
      <div style={s.modal}>
        <h2 style={s.title}>FreeRouting Desktop</h2>
        {state.frStatus === 'loading' && <p style={s.text}>Initializing...</p>}
        {state.frStatus === 'not-installed' && (
          <>
            <p style={s.text}>FreeRouting is not installed on your system.</p>
            <p style={s.hint}>Download FreeRouting from the official GitHub page, install it, then select the executable below.</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 20 }}>
              <button style={s.btn} onClick={() => window.openURL('https://github.com/freerouting/freerouting/releases/latest')}>
                Download FreeRouting
              </button>
              <button style={{ ...s.btn, background: '#16c79a' }} onClick={handleSelectFreeRouting}>
                Select FreeRouting Executable
              </button>
            </div>
          </>
        )}
        {error && <p style={{ ...s.text, color: '#e94560', marginTop: 16 }}>Error: {error}</p>}
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: '#16213e', borderRadius: 12, padding: '40px 48px', textAlign: 'center' as const, minWidth: 420, border: '1px solid #0f3460' },
  title: { color: '#e94560', marginBottom: 24, fontSize: 20 },
  text: { color: '#aaa', marginBottom: 8, fontSize: 14, lineHeight: 1.5 },
  hint: { color: '#777', fontSize: 12, lineHeight: 1.5, marginTop: 4 },
  btn: { padding: '8px 20px', border: 'none', borderRadius: 6, background: '#e94560', color: '#fff', cursor: 'pointer', fontSize: 13 },
}
