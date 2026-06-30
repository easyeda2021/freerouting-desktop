import { useEffect, useRef } from 'react'
import { useApp } from '../App'
import { createPcbRenderer } from '../lib/pcb-renderer'

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

    window.addEventListener('resize', handleResize)
    document.addEventListener('fullscreenchange', handleResize)
    resizeObserver.observe(container)
    container.addEventListener('wheel', handleWheel, { passive: false })
    container.addEventListener('keydown', handleKeyDown)
    container.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    container.addEventListener('contextmenu', handleContextMenu)

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
      rendererRef.current?.destroy()
    }
  }, [])

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
          // Let Leafer finish layout before fitting
          requestAnimationFrame(() => rendererRef.current?.fitView())
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
    console.log('[measure effect]', m.active, 'start', m.start, 'end', m.end, 'cursor', m.cursor)
    if (!m.active) {
      rendererRef.current?.clearMeasurement()
    } else if (m.start && m.end) {
      console.log('[measure effect] draw final')
      rendererRef.current?.drawMeasurement(m.start, m.end)
    } else if (m.start && m.cursor) {
      console.log('[measure effect] draw preview')
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

  return (
    <div ref={containerRef} style={s.canvas} tabIndex={0}>
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
}
