import { useEffect, useRef } from 'react'
import { useApp } from '../App'
import { createPcbRenderer } from '../lib/pcb-renderer'

export default function BoardCanvas() {
  const { state } = useApp()
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<ReturnType<typeof createPcbRenderer> | null>(null)
  const isDragging = useRef(false)
  const lastPos = useRef<{ x: number; y: number } | null>(null)

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
    }

    const handleKeyDown = (e: KeyboardEvent) => {
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
      if (e.button === 0 || e.button === 2) {
        isDragging.current = true
        lastPos.current = { x: e.clientX, y: e.clientY }
        e.preventDefault()
      }
    }

    const handleMouseMove = (e: MouseEvent) => {
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
      try {
        rendererRef.current.render(state.boardData, state.layerVisibility)
      } catch (e) {
        console.error('Render error:', e)
      }
    }
  }, [state.boardData, state.layerVisibility])

  return <div ref={containerRef} style={s.canvas} tabIndex={0} />
}

const s: Record<string, React.CSSProperties> = {
  canvas: { flex: 1, background: '#0a0a1a', overflow: 'hidden', outline: 'none' },
}
