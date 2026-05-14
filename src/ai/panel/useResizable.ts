import { useCallback, useEffect, useRef } from 'react'
import {
  PANEL_MAX_HEIGHT_RATIO,
  PANEL_MAX_WIDTH,
  PANEL_MIN_SIZE,
  type PanelSize,
} from '../types'

/**
 * 可缩放 hook（headless）
 *
 * 三处手柄：右下角 / 右边缘 / 下边缘。
 * 调用方为每处手柄分别绑 onPointerDown，传入对应 dir。
 *
 * - dir='se' → 同时调宽高
 * - dir='e'  → 仅宽
 * - dir='s'  → 仅高
 *
 * 缩放时光标变 `nwse-resize / ew-resize / ns-resize` 让用户有反馈。
 */
export type ResizeDir = 'se' | 'e' | 's'

interface UseResizableOpts {
  size: PanelSize
  onChange: (next: PanelSize) => void
  disabled?: boolean
}

export function useResizable({ size, onChange, disabled }: UseResizableOpts) {
  const resizingRef = useRef<{
    dir: ResizeDir
    startX: number
    startY: number
    startW: number
    startH: number
  } | null>(null)

  const sizeRef = useRef(size)
  sizeRef.current = size

  const onPointerDown = useCallback(
    (dir: ResizeDir) => (e: React.PointerEvent) => {
      if (disabled) return
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      resizingRef.current = {
        dir,
        startX: e.clientX,
        startY: e.clientY,
        startW: sizeRef.current.width,
        startH: sizeRef.current.height,
      }
      document.body.style.userSelect = 'none'
      document.body.style.cursor = CURSOR[dir]
    },
    [disabled],
  )

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const r = resizingRef.current
      if (!r) return
      const dx = e.clientX - r.startX
      const dy = e.clientY - r.startY
      const next: PanelSize = {
        width: r.dir === 's' ? r.startW : r.startW + dx,
        height: r.dir === 'e' ? r.startH : r.startH + dy,
      }
      onChange(clamp(next))
    }
    const onUp = () => {
      if (!resizingRef.current) return
      resizingRef.current = null
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [onChange])

  return { onPointerDown }
}

const CURSOR: Record<ResizeDir, string> = {
  se: 'nwse-resize',
  e: 'ew-resize',
  s: 'ns-resize',
}

function clamp(s: PanelSize): PanelSize {
  const maxHeight =
    typeof window !== 'undefined'
      ? Math.floor(window.innerHeight * PANEL_MAX_HEIGHT_RATIO)
      : 800
  return {
    width: Math.max(PANEL_MIN_SIZE.width, Math.min(PANEL_MAX_WIDTH, s.width)),
    height: Math.max(PANEL_MIN_SIZE.height, Math.min(maxHeight, s.height)),
  }
}
