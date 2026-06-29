import { useEffect, useRef } from 'react'
import { useApp } from '../App'
import { createPcbRenderer } from '../lib/pcb-renderer'

export default function BoardCanvas() {
  const { state } = useApp()
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<ReturnType<typeof createPcbRenderer> | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    rendererRef.current = createPcbRenderer(container)
    container.focus()

    const handleResize = () => {
      // Delay slightly so container has finished layout
      setTimeout(() => rendererRef.current?.resize(), 50)
    }

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

    const handleMouseDown = () => container.focus()

    window.addEventListener('resize', handleResize)
    document.addEventListener('fullscreenchange', handleResize)
    container.addEventListener('wheel', handleWheel, { passive: false })
    container.addEventListener('keydown', handleKeyDown)
    container.addEventListener('mousedown', handleMouseDown)

    return () => {
      window.removeEventListener('resize', handleResize)
      document.removeEventListener('fullscreenchange', handleResize)
      container.removeEventListener('wheel', handleWheel)
      container.removeEventListener('keydown', handleKeyDown)
      container.removeEventListener('mousedown', handleMouseDown)
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
