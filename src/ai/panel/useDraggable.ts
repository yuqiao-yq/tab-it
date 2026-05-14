import { useCallback, useEffect, useRef } from 'react'
import {
  PANEL_VIEWPORT_PAD,
  type PanelPosition,
  type PanelSize,
} from '../types'

/**
 * 可拖动 hook（headless）
 *
 * 用法：
 *   const { onPointerDown } = useDraggable({
 *     position, size, onChange, disabled
 *   })
 *   <div onPointerDown={onPointerDown} ...
 *
 * 实现要点：
 * - pointermove 期间用 transform: translate3d 而非 left/top，避免 reflow
 *   （但本 hook 只负责"算坐标 + 调 onChange"；实际样式由调用方写到容器上）
 * - 拖动期间禁文本选中（避免鼠标拖出文字一片选中）
 * - 拖动期间设置 cursor: grabbing
 * - 边界保护：至少 PANEL_VIEWPORT_PAD 像素留在视口里
 * - 全局监听 pointermove/up：避免拖到浮窗外失焦后无法继续
 */
interface UseDraggableOpts {
  position: PanelPosition
  size: PanelSize
  /** 拖动结束后的最终坐标（已 clamp） */
  onChange: (next: PanelPosition) => void
  /** 拖动开始时的回调（可用于"拉到 z-index 最顶"等副作用） */
  onDragStart?: () => void
  disabled?: boolean
}

export function useDraggable({
  position,
  size,
  onChange,
  onDragStart,
  disabled,
}: UseDraggableOpts) {
  // 用 ref 保留拖动起点 + 起始坐标，避免 closure stale
  const draggingRef = useRef(false)
  const startRef = useRef({
    pointerX: 0,
    pointerY: 0,
    panelX: 0,
    panelY: 0,
  })

  // 用 ref 同步最新 position/size，否则全局监听器闭包里取不到最新值
  const positionRef = useRef(position)
  positionRef.current = position
  const sizeRef = useRef(size)
  sizeRef.current = size

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return
      // 仅左键
      if (e.button !== 0) return
      // 输入控件、按钮等不应该触发拖动（让它们的事件正常冒泡）
      const target = e.target as HTMLElement
      if (
        target.closest('button, a, input, textarea, select, [data-no-drag]')
      ) {
        return
      }
      e.preventDefault()
      draggingRef.current = true
      startRef.current = {
        pointerX: e.clientX,
        pointerY: e.clientY,
        panelX: positionRef.current.x,
        panelY: positionRef.current.y,
      }
      // 视觉反馈
      document.body.style.userSelect = 'none'
      document.body.style.cursor = 'grabbing'
      onDragStart?.()
    },
    [disabled, onDragStart],
  )

  // 全局监听 move/up
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current) return
      const { pointerX, pointerY, panelX, panelY } = startRef.current
      const dx = e.clientX - pointerX
      const dy = e.clientY - pointerY
      const next = clamp(
        { x: panelX + dx, y: panelY + dy },
        sizeRef.current,
      )
      onChange(next)
    }
    const onUp = () => {
      if (!draggingRef.current) return
      draggingRef.current = false
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

function clamp(p: PanelPosition, size: PanelSize): PanelPosition {
  if (typeof window === 'undefined') return p
  const viewport = { width: window.innerWidth, height: window.innerHeight }
  const minX = PANEL_VIEWPORT_PAD - size.width // 允许部分挪出左侧
  const maxX = viewport.width - PANEL_VIEWPORT_PAD
  const minY = 0
  const maxY = viewport.height - PANEL_VIEWPORT_PAD
  return {
    x: Math.max(minX, Math.min(maxX, p.x)),
    y: Math.max(minY, Math.min(maxY, p.y)),
  }
}
