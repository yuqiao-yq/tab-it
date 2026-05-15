import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../utils/cn'

export interface CardMenuItem {
  key: string
  label: string
  /** 可选：左侧图标节点（建议 14x14） */
  icon?: React.ReactNode
  /** 危险操作（红字） */
  danger?: boolean
  disabled?: boolean
  onSelect: () => void
}

interface Props {
  items: CardMenuItem[]
  /** 自定义触发器；不传则用默认的"⋮"按钮 */
  trigger?: (open: () => void, isOpen: boolean) => React.ReactNode
  /** 触发器按钮额外样式（仅默认触发器下生效） */
  triggerClassName?: string
  /** 菜单对齐：默认 right（菜单右边对齐触发器右边） */
  align?: 'left' | 'right'
  /** 菜单宽度（px），默认 140 */
  menuWidth?: number
  /** 触发器无障碍 label */
  ariaLabel?: string
  /**
   * 菜单 portal 的 z-index，默认 9999。
   * 浮窗（z-[10100]）等高 z 容器内调用时需传更高值，否则菜单弹出会被遮挡。
   */
  menuZIndex?: number
}

const VIEWPORT_PAD = 8

/**
 * 卡片右上角"⋮ 更多"菜单。
 *
 * - 用 React Portal 挂载到 document.body，彻底避开任何祖先 overflow:hidden /
 *   transform 创建的 stacking context（与 IconPicker 同款方案）
 * - 位置基于触发器 boundingRect 实时计算，监听 scroll(capture) / resize 跟随
 * - 边界自动翻转：右侧溢出时改为右对齐；下方放不下则向上展开
 * - 触发器与菜单都阻止事件冒泡，避免触发卡片本身的 click（打开链接 / 进入文件夹）
 */
export function CardMenu({
  items,
  trigger,
  triggerClassName,
  align = 'right',
  menuWidth = 140,
  ariaLabel = '更多操作',
  menuZIndex = 9999,
}: Props) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  const triggerRef = useRef<HTMLSpanElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  // 估算高度：每项 ~32px + 上下 padding，用于决定向上还是向下
  const estimatedHeight = items.length * 32 + 8

  // 点击外部关闭
  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node
      if (triggerRef.current?.contains(t)) return
      if (menuRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // 计算位置
  useLayoutEffect(() => {
    if (!open) return
    const update = () => {
      const trig = triggerRef.current
      if (!trig) return
      const rect = trig.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight

      let left = align === 'right' ? rect.right - menuWidth : rect.left
      if (left + menuWidth > vw - VIEWPORT_PAD) left = vw - menuWidth - VIEWPORT_PAD
      if (left < VIEWPORT_PAD) left = VIEWPORT_PAD

      const spaceBelow = vh - rect.bottom - VIEWPORT_PAD
      const spaceAbove = rect.top - VIEWPORT_PAD
      let top: number
      if (spaceBelow >= estimatedHeight || spaceBelow >= spaceAbove) {
        top = rect.bottom + 4
      } else {
        top = Math.max(VIEWPORT_PAD, rect.top - estimatedHeight - 4)
      }
      setPos({ top, left })
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open, align, menuWidth, estimatedHeight])

  const toggle = () => setOpen((v) => !v)

  const renderTrigger = () => {
    if (trigger) return trigger(toggle, open)
    return (
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          toggle()
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className={cn(
          'inline-flex items-center justify-center w-6 h-6 rounded',
          'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200',
          'hover:bg-slate-100 dark:hover:bg-slate-700/60',
          'transition-colors',
          open && 'text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-700/60',
          triggerClassName,
        )}
        title="更多操作"
      >
        <DotsVerticalIcon />
      </button>
    )
  }

  const menu = open && pos && createPortal(
    <div
      ref={menuRef}
      role="menu"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        top: pos.top,
        left: pos.left,
        width: menuWidth,
        zIndex: menuZIndex,
      }}
      className={cn(
        'fixed py-1 rounded-md',
        'bg-white dark:bg-slate-800',
        'border border-slate-200 dark:border-slate-700',
        'shadow-lg',
      )}
    >
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          onClick={(e) => {
            e.stopPropagation()
            if (item.disabled) return
            setOpen(false)
            // 用微任务延后到关闭后再执行，避免某些 confirm/prompt 弹层与菜单关闭逻辑冲突
            queueMicrotask(() => item.onSelect())
          }}
          className={cn(
            'w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left',
            'transition-colors',
            item.disabled
              ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
              : item.danger
                ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10'
                : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/60',
          )}
        >
          {item.icon && <span className="shrink-0 inline-flex">{item.icon}</span>}
          <span className="truncate">{item.label}</span>
        </button>
      ))}
    </div>,
    document.body,
  )

  return (
    <>
      <span ref={triggerRef} className="inline-flex">
        {renderTrigger()}
      </span>
      {menu}
    </>
  )
}

// ─── 内置 icon ─────────────────────────────────
function DotsVerticalIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
    </svg>
  )
}

/** 常用菜单项图标（14x14，stroke 风格） */
export const MenuIcons = {
  Edit: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  ),
  Trash: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  ),
  Note: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="17" x2="13" y2="17" />
    </svg>
  ),
  Sparkle: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3l1.9 5.4L19 10l-5.1 1.6L12 17l-1.9-5.4L5 10l5.1-1.6L12 3z" />
      <path d="M19 16l.7 1.9L21 18.5l-1.3.6L19 21l-.7-1.9L17 18.5l1.3-.6L19 16z" />
    </svg>
  ),
}
