import { useEffect, useRef, useState, useCallback } from 'react'
import { useApp } from '../App'
import { createPcbRenderer } from '../lib/pcb-renderer'
import { loadDsnFromContent } from '../lib/dsn-loader'

export default function BoardCanvas() {
  const { state, dispatch } = useApp()
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<ReturnType<typeof createPcbRenderer> | null>(null)
  const crosshairRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const lastPos = useRef<{ x: number; y: number } | null>(null)
  const hasFittedRef = useRef(false)
  const prevDsnRef = useRef<string | null>(null)
  const measurementRef = useRef(state.measurement)
  const measurePhaseRef = useRef<'idle' | 'started'>('idle')
  const [dragOver, setDragOver] = useState(false)

  const handleOpenDroppedFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.dsn')) {
      dispatch({ type: 'ADD_LOG', entry: { timestamp: new Date().toISOString(), type: 'Warn', message: `Only .dsn files are supported for drag-and-drop (got ${file.name})`, topic: 'App' } })
      return
    }
    try {
      const content = await file.text()
      if (!content) return
      await loadDsnFromContent(dispatch, content, file.name, undefined)
    } catch (err) {
      dispatch({ type: 'ADD_LOG', entry: { timestamp: new Date().toISOString(), type: 'Error', message: `Failed to load DSN: ${err}`, topic: 'App' } })
    }
  }, [dispatch])

  const handleOpenByDialog = useCallback(async () => {
    let path: string
    try {
      path = await window.openFileDialog()
    } catch (err) {
      console.error('Native file dialog failed:', err)
      return
    }
    if (!path) return
    const content = await window.readFile(path)
    if (!content) {
      dispatch({ type: 'ADD_LOG', entry: { timestamp: new Date().toISOString(), type: 'Error', message: `Failed to read file: ${path}`, topic: 'App' } })
      return
    }
    try {
      const fileName = path.replace(/\\/g, '/').split('/').pop() || 'board.dsn'
      await loadDsnFromContent(dispatch, content, fileName, path)
    } catch (err) {
      dispatch({ type: 'ADD_LOG', entry: { timestamp: new Date().toISOString(), type: 'Error', message: `Failed to load DSN: ${err}`, topic: 'App' } })
    }
  }, [dispatch])

  useEffect(() => {
    measurementRef.current = state.measurement
  }, [state.measurement])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    rendererRef.current = createPcbRenderer(container)
    container.focus()

    const handleResize = () => {
      setTimeout(() => rendererRef.current?.resize(), 100)
    }

    const resizeObserver = new ResizeObserver(() => {
      setTimeout(() => rendererRef.current?.resize(), 100)
    })

    const updateCrosshair = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      if (crosshairRef.current) {
        crosshairRef.current.style.setProperty('--x', `${x}px`)
        crosshairRef.current.style.setProperty('--y', `${y}px`)
      }
    }

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = container.getBoundingClientRect()
      rendererRef.current?.zoomBy(e.deltaY, e.clientX - rect.left, e.clientY - rect.top)
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (measurementRef.current.active) {
          dispatch({ type: 'SET_MEASUREMENT', measurement: { active: false, start: null, end: null, cursor: null } })
          measurePhaseRef.current = 'idle'
        } else {
          dispatch({ type: 'SELECT_OBJECT', object: null })
          dispatch({ type: 'SELECT_NET', netName: null })
        }
        return
      }
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return
      e.preventDefault()
      const step = 80 / (rendererRef.current?.getScale() || 1)
      if (e.key === 'ArrowLeft') rendererRef.current?.panBy(step, 0)
      else if (e.key === 'ArrowRight') rendererRef.current?.panBy(-step, 0)
      else if (e.key === 'ArrowUp') rendererRef.current?.panBy(0, step)
      else rendererRef.current?.panBy(0, -step)
    }

    const handleMouseDown = (e: MouseEvent) => {
      container.focus()
      if (measurementRef.current.active) {
        if (e.button === 2) {
          e.preventDefault()
          dispatch({ type: 'SET_MEASUREMENT', measurement: { active: false, start: null, end: null, cursor: null } })
          measurePhaseRef.current = 'idle'
          return
        }
        if (e.button === 0) {
          e.preventDefault()
          const pos = rendererRef.current?.screenToBoard(e.clientX, e.clientY)
          if (!pos) return
          updateCrosshair(e)
          const m = measurementRef.current
          if (!m.start || m.end) {
            // Start a new measurement, clearing any previous result
            dispatch({ type: 'SET_MEASUREMENT', measurement: { start: pos, end: null, cursor: pos } })
            measurePhaseRef.current = 'started'
          } else {
            // Finish current measurement
            dispatch({ type: 'SET_MEASUREMENT', measurement: { end: pos } })
            measurePhaseRef.current = 'idle'
          }
          return
        }
      }
      if (e.button === 0 || e.button === 2) {
        isDragging.current = true
        lastPos.current = { x: e.clientX, y: e.clientY }
        e.preventDefault()
      }
    }

    const handleMouseMove = (e: MouseEvent) => {
      const pos = rendererRef.current?.screenToBoard(e.clientX, e.clientY)
      if (pos) {
        dispatch({ type: 'SET_MEASUREMENT', measurement: { cursor: pos } })
      }
      if (measurementRef.current.active) {
        updateCrosshair(e)
      }
      if (!isDragging.current || !lastPos.current) return
      const dx = e.clientX - lastPos.current.x
      const dy = e.clientY - lastPos.current.y
      lastPos.current = { x: e.clientX, y: e.clientY }
      rendererRef.current?.panBy(dx, dy)
    }

    const handleMouseUp = () => {
      isDragging.current = false
      lastPos.current = null
    }

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault()
    }

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
      setDragOver(true)
    }

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setDragOver(false)
    }

    const handleDrop = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setDragOver(false)
      const file = e.dataTransfer?.files?.[0]
      if (file) handleOpenDroppedFile(file)
    }

    // Global drop target so dragging over the Leafer canvas (or any child)
    // still opens the file when a DSN is already loaded.
    const handleGlobalDragOver = (e: DragEvent) => {
      if (!container.contains(e.target as Node)) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
      setDragOver(true)
    }
    const handleGlobalDragLeave = (e: DragEvent) => {
      if (!container.contains(e.target as Node)) return
      setDragOver(false)
    }
    const handleGlobalDrop = (e: DragEvent) => {
      if (!container.contains(e.target as Node)) return
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer?.files?.[0]
      if (file) handleOpenDroppedFile(file)
    }

    window.addEventListener('resize', handleResize)
    document.addEventListener('fullscreenchange', handleResize)
    resizeObserver.observe(container)
    container.addEventListener('wheel', handleWheel, { passive: false })
    container.addEventListener('keydown', handleKeyDown)
    container.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    container.addEventListener('contextmenu', handleContextMenu)
    container.addEventListener('dragover', handleDragOver)
    container.addEventListener('dragleave', handleDragLeave)
    container.addEventListener('drop', handleDrop)
    window.addEventListener('dragover', handleGlobalDragOver)
    window.addEventListener('dragleave', handleGlobalDragLeave)
    window.addEventListener('drop', handleGlobalDrop)

    return () => {
      window.removeEventListener('resize', handleResize)
      document.removeEventListener('fullscreenchange', handleResize)
      resizeObserver.disconnect()
      container.removeEventListener('wheel', handleWheel)
      container.removeEventListener('keydown', handleKeyDown)
      container.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      container.removeEventListener('contextmenu', handleContextMenu)
      container.removeEventListener('dragover', handleDragOver)
      container.removeEventListener('dragleave', handleDragLeave)
      container.removeEventListener('drop', handleDrop)
      window.removeEventListener('dragover', handleGlobalDragOver)
      window.removeEventListener('dragleave', handleGlobalDragLeave)
      window.removeEventListener('drop', handleGlobalDrop)
      rendererRef.current?.destroy()
    }
  }, [handleOpenDroppedFile])

  useEffect(() => {
    if (state.boardData && rendererRef.current) {
      const isNewDsn = prevDsnRef.current !== state.currentDsn
      const hiddenNets = new Set(state.nets.filter((n) => !n.visible).map((n) => n.name))
      try {
        rendererRef.current.render(state.boardData, state.layerVisibility, {
          hiddenNets,
          selectedNet: state.selectedNet,
          selectedObject: state.selectedObject,
          layerColors: state.layerColors,
          onSelectTrace: (trace) => {
            dispatch({ type: 'SELECT_OBJECT', object: { type: 'trace', id: trace.netName || '', netName: trace.netName, layer: trace.layer } })
            dispatch({ type: 'SELECT_NET', netName: trace.netName || null })
          },
          onSelectVia: (via) => {
            dispatch({ type: 'SELECT_OBJECT', object: { type: 'via', id: via.netName || '', netName: via.netName } })
            dispatch({ type: 'SELECT_NET', netName: via.netName || null })
          },
          onSelectComponent: (comp) => dispatch({ type: 'SELECT_OBJECT', object: { type: 'component', id: comp.refdes, refdes: comp.refdes } }),
          onSelectPad: (pad) => dispatch({ type: 'SELECT_OBJECT', object: pad }),
          onEmptyClick: () => {
            dispatch({ type: 'SELECT_OBJECT', object: null })
            dispatch({ type: 'SELECT_NET', netName: null })
          },
        })
        if (isNewDsn || !hasFittedRef.current) {
          rendererRef.current?.fitView()
          hasFittedRef.current = true
          prevDsnRef.current = state.currentDsn
        }
      } catch (e) {
        console.error('Render error:', e)
      }
    } else if (!state.boardData) {
      hasFittedRef.current = false
      prevDsnRef.current = null
    }
  }, [state.boardData, state.layerVisibility, state.layerColors, state.nets, state.selectedNet, state.selectedObject, state.currentDsn, dispatch])

  useEffect(() => {
    const m = state.measurement
    if (!m.active) {
      rendererRef.current?.clearMeasurement()
    } else if (m.start && m.end) {
      rendererRef.current?.drawMeasurement(m.start, m.end)
    } else if (m.start && m.cursor) {
      rendererRef.current?.drawMeasurementPreview(m.start, m.cursor)
    } else {
      rendererRef.current?.clearMeasurement()
    }
    rendererRef.current?.drawCrosshair(null)
    if (crosshairRef.current) {
      crosshairRef.current.style.display = state.measurement.active ? 'block' : 'none'
    }
  }, [state.measurement, state.boardData])

  useEffect(() => {
    if (state.panTarget && rendererRef.current) {
      rendererRef.current.panTo(state.panTarget.x, state.panTarget.y)
      dispatch({ type: 'SET_PAN_TARGET', target: null })
    }
  }, [state.panTarget, dispatch])

  useEffect(() => {
    rendererRef.current?.fitView()
  }, [state.fitViewTrigger])

  const showEmptyState = !state.boardData

  return (
    <div ref={containerRef} style={s.canvas} tabIndex={0}>
      {showEmptyState && (
        <div style={{ ...s.emptyOverlay, ...(dragOver ? s.emptyOverlayActive : {}) }}>
          <div style={s.emptyBox}>
            <div style={s.emptyTitle}>FreeRouting Desktop</div>
            <button style={s.emptyBtn} onClick={handleOpenByDialog}>打开文件</button>
            <div style={s.emptyHint}>请打开 DSN 文件或拖动 DSN 文件在此处打开</div>
          </div>
        </div>
      )}
      <div ref={crosshairRef} style={s.crosshair}>
        <div style={s.crosshairH} />
        <div style={s.crosshairV} />
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  canvas: { flex: 1, background: '#0a0a1a', overflow: 'hidden', outline: 'none', position: 'relative' },
  crosshair: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    display: 'none',
    '--x': '0px',
    '--y': '0px',
  } as React.CSSProperties,
  crosshairH: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 'var(--y)',
    height: 1,
    background: '#ffffff',
  } as React.CSSProperties,
  crosshairV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 'var(--x)',
    width: 1,
    background: '#ffffff',
  } as React.CSSProperties,
  emptyOverlay: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, transition: 'background 0.15s' },
  emptyOverlayActive: { background: 'rgba(233, 69, 96, 0.08)' },
  emptyBox: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, width: 360, height: 240, border: '2px dashed #4a5568', borderRadius: 16, background: 'rgba(15, 52, 96, 0.3)', padding: 32 },
  emptyTitle: { color: '#e0e0e0', fontSize: 22, fontWeight: 600, letterSpacing: 1 },
  emptyBtn: { padding: '10px 28px', border: '1px solid #4a5568', borderRadius: 6, background: '#0f3460', color: '#e0e0e0', cursor: 'pointer', fontSize: 14, fontWeight: 500 },
  emptyHint: { color: '#888', fontSize: 12, textAlign: 'center', lineHeight: 1.5 },
}
