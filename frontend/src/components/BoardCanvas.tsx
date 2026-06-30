import { useEffect, useRef } from 'react'
import { useApp } from '../App'
import { createPcbRenderer } from '../lib/pcb-renderer'

export default function BoardCanvas() {
  const { state, dispatch } = useApp()
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<ReturnType<typeof createPcbRenderer> | null>(null)
  const isDragging = useRef(false)
  const lastPos = useRef<{ x: number; y: number } | null>(null)
  const hasFittedRef = useRef(false)
  const prevDsnRef = useRef<string | null>(null)
  const measurementRef = useRef(state.measurement)

  useEffect(() => {
    measurementRef.current = state.measurement
  }, [state.measurement])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    rendererRef.current = createPcbRenderer(container)
    container.focus()

    const handleResize = () => {
      // Delay slightly so container has finished layout
      setTimeout(() => rendererRef.current?.resize(), 100)
    }

    const resizeObserver = new ResizeObserver(() => {
      // ResizeObserver fires when the container size actually changes;
      // this catches maximize/minimize more reliably than window.resize.
      setTimeout(() => rendererRef.current?.resize(), 100)
    })

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = container.getBoundingClientRect()
      rendererRef.current?.zoomBy(e.deltaY, e.clientX - rect.left, e.clientY - rect.top)
      if (measurementRef.current.active) {
        const pos = rendererRef.current?.screenToBoard(e.clientX, e.clientY)
        if (pos) rendererRef.current?.drawCrosshair(pos)
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (measurementRef.current.active) {
          dispatch({ type: 'SET_MEASUREMENT', measurement: { active: false, start: null, end: null } })
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
          return
        }
        if (e.button === 0) {
          e.preventDefault()
          const pos = rendererRef.current?.screenToBoard(e.clientX, e.clientY)
          if (!pos) return
          if (!measurementRef.current.start || measurementRef.current.end) {
            // Start a new measurement, replacing any previous result
            dispatch({ type: 'SET_MEASUREMENT', measurement: { start: pos, end: null } })
          } else {
            dispatch({ type: 'SET_MEASUREMENT', measurement: { end: pos } })
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
        if (measurementRef.current.active) {
          rendererRef.current?.drawCrosshair(pos)
        }
      }
      if (!isDragging.current || !lastPos.current) return
      const dx = e.clientX - lastPos.current.x
      const dy = e.clientY - lastPos.current.y
      lastPos.current = { x: e.clientX, y: e.clientY }
      rendererRef.current?.panBy(dx, dy)
      if (measurementRef.current.active && pos) {
        rendererRef.current?.drawCrosshair(pos)
      }
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
          layerColors: state.layerColors,
          onSelectTrace: (trace) => dispatch({ type: 'SELECT_NET', netName: trace.netName || null }),
          onSelectVia: (via) => dispatch({ type: 'SELECT_NET', netName: via.netName || null }),
          onSelectComponent: (comp) => dispatch({ type: 'SELECT_OBJECT', object: { type: 'component', id: comp.refdes, refdes: comp.refdes } }),
          onSelectPad: (pad) => dispatch({ type: 'SELECT_OBJECT', object: pad }),
        })
        if (isNewDsn || !hasFittedRef.current) {
          rendererRef.current.fitView()
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
  }, [state.boardData, state.layerVisibility, state.layerColors, state.nets, state.selectedNet, state.currentDsn, dispatch])

  useEffect(() => {
    rendererRef.current?.drawMeasurement(state.measurement.start, state.measurement.end)
    if (!state.measurement.active) {
      rendererRef.current?.drawCrosshair(null)
    } else if (state.measurement.cursor) {
      rendererRef.current?.drawCrosshair(state.measurement.cursor)
    }
    if (containerRef.current) {
      containerRef.current.style.cursor = state.measurement.active ? 'none' : 'default'
    }
  }, [state.measurement, state.boardData])

  useEffect(() => {
    if (state.panTarget && rendererRef.current) {
      rendererRef.current.panTo(state.panTarget.x, state.panTarget.y)
      dispatch({ type: 'SET_PAN_TARGET', target: null })
    }
  }, [state.panTarget, dispatch])

  return <div ref={containerRef} style={s.canvas} tabIndex={0} />
}

const s: Record<string, React.CSSProperties> = {
  canvas: { flex: 1, background: '#0a0a1a', overflow: 'hidden', outline: 'none' },
}
