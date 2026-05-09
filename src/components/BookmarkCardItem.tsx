import { useEffect, useRef } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { BookmarkCard } from '../types/bookmark'
import { getFaviconUrl, getHostname } from '../utils/favicon'
import { useBookmarkStore } from '../stores/useBookmarkStore'
import { cn } from '../utils/cn'

interface Props {
  card: BookmarkCard
}

/**
 * 书签卡片：
 * - 整张卡片点击 → 在新标签页打开 URL
 *   （dnd-kit 已配置 5px 拖拽阈值；下方 useEffect 再做一道保险，
 *    若 pointerdown→up 位移 > 5px 则标记为「拖拽刚结束」，本次 click 跳过打开）
 * - hover 时右上角显示编辑标题/删除按钮
 * - 底部备注区始终可见：
 *   - 已有备注 → 直接展示备注文本（最多 2 行），点击进入编辑
 *   - 无备注  → 展示低调的「+ 添加备注」占位按钮
 */
export function BookmarkCardItem({ card }: Props) {
  const removeCard = useBookmarkStore((s) => s.removeCard)
  const updateCard = useBookmarkStore((s) => s.updateCard)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id })

  const cardRef = useRef<HTMLDivElement | null>(null)
  const draggedRecently = useRef(false)

  // 合并 ref（既给 dnd-kit，也给本组件用）
  const setRefs = (el: HTMLDivElement | null) => {
    cardRef.current = el
    setNodeRef(el)
  }

  // 用原生事件捕获 pointerdown/up，不干扰 dnd-kit 的 listeners
  useEffect(() => {
    const el = cardRef.current
    if (!el) return
    let downX = 0
    let downY = 0
    const onDown = (e: PointerEvent) => { downX = e.clientX; downY = e.clientY }
    const onUp = (e: PointerEvent) => {
      const moved = Math.hypot(e.clientX - downX, e.clientY - downY)
      draggedRecently.current = moved > 5
    }
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointerup', onUp)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointerup', onUp)
    }
  }, [])

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const openUrl = () => {
    if (draggedRecently.current) return
    window.open(card.url, '_blank', 'noopener,noreferrer')
  }

  const handleEditTitle = () => {
    const newTitle = window.prompt('编辑标题', card.title)
    if (newTitle !== null && newTitle.trim()) {
      void updateCard(card.id, { title: newTitle.trim() })
    }
  }

  const handleEditNote = () => {
    const next = window.prompt(
      card.description ? '编辑备注' : '为该书签添加备注',
      card.description ?? '',
    )
    // 取消 prompt（null）→ 不动；空字符串 → 清除备注
    if (next === null) return
    void updateCard(card.id, { description: next.trim() || undefined })
  }

  const handleDelete = () => {
    if (window.confirm(`删除「${card.title}」？`)) void removeCard(card.id)
  }

  return (
    <div
      ref={setRefs}
      style={style}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        if (e.defaultPrevented) return
        openUrl()
      }}
      className={cn(
        'card group p-3 select-none cursor-pointer',
        'flex flex-col gap-2 h-32',
        'hover:border-brand/40 hover:shadow-brand/10',
      )}
      title={`点击打开：${card.url}`}
    >
      {/* 顶部：图标 + 标题/域名 + hover 操作按钮 */}
      <div className="flex items-start gap-2">
        <img
          src={card.icon || getFaviconUrl(card.url)}
          alt=""
          className="w-8 h-8 rounded shrink-0 bg-slate-100 dark:bg-slate-700 object-contain"
          onError={(e) => {
            ;(e.currentTarget as HTMLImageElement).style.visibility = 'hidden'
          }}
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate" title={card.title}>
            {card.title}
          </div>
          <div className="text-xs text-slate-400 truncate">
            {getHostname(card.url)}
          </div>
        </div>
        <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            type="button"
            className="text-[11px] text-slate-400 hover:text-brand px-1 leading-none"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              handleEditTitle()
            }}
            onPointerDown={(e) => e.stopPropagation()}
            title="编辑标题"
          >
            ✎
          </button>
          <button
            type="button"
            className="text-[11px] text-slate-400 hover:text-red-500 px-1 leading-none"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              handleDelete()
            }}
            onPointerDown={(e) => e.stopPropagation()}
            title="删除"
          >
            ✕
          </button>
        </div>
      </div>

      {/* 底部备注区：始终可见 */}
      <div className="mt-auto">
        {card.description ? (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              handleEditNote()
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className={cn(
              'w-full text-left text-xs text-slate-500 dark:text-slate-400',
              'leading-snug line-clamp-2',
              'rounded px-1.5 py-1 -mx-1.5',
              'hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors',
            )}
            title="点击编辑备注"
          >
            {card.description}
          </button>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              handleEditNote()
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className={cn(
              'w-full text-left text-xs',
              'rounded px-1.5 py-1 -mx-1.5',
              'text-slate-300 dark:text-slate-600',
              'hover:text-brand hover:bg-slate-100 dark:hover:bg-slate-700/60',
              'transition-colors',
            )}
            title="为该书签添加备注"
          >
            + 添加备注
          </button>
        )}
      </div>
    </div>
  )
}
