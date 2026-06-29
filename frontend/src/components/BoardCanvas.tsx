import { useEffect, useRef } from 'react'
import { useApp } from '../App'
import { createPcbRenderer } from '../lib/pcb-renderer'

export default function BoardCanvas() {
  const { state } = useApp()
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<ReturnType<typeof createPcbRenderer> | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    rendererRef.current = createPcbRenderer(containerRef.current)

    const handleResize = () => {
      // Delay slightly so container has finished layout
      setTimeout(() => rendererRef.current?.resize(), 50)
    }

    window.addEventListener('resize', handleResize)
    document.addEventListener('fullscreenchange', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      document.removeEventListener('fullscreenchange', handleResize)
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
  canvas: { flex: 1, background: '#0a0a1a', overflow: 'hidden' },
}
