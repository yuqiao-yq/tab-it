import { useEffect, useRef, useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { BookmarkCard } from '../types/bookmark'
import { getHostname } from '../utils/favicon'
import { useBookmarkStore } from '../stores/useBookmarkStore'
import { cn } from '../utils/cn'
import { IconPicker } from './IconPicker'
import { isImageIcon } from '../utils/icon'
import { CardMenu, MenuIcons, type CardMenuItem } from './CardMenu'
import { FaviconImg } from './FaviconImg'

interface Props {
  card: BookmarkCard
  /**
   * 是否参与 dnd-kit 排序拖拽。默认 true（在 BookmarkGrid 的常规分类区域使用）。
   * "最近使用"模块需要传 false：顺序由 openedAt 决定，不允许用户手动排序。
   */
  draggable?: boolean
}

/**
 * 书签卡片：
 * - 整张卡片点击 → 在新标签页打开 URL
 *   （dnd-kit 已配置 5px 拖拽阈值；下方 useEffect 再做一道保险，
 *    若 pointerdown→up 位移 > 5px 则标记为「拖拽刚结束」，本次 click 跳过打开）
 * - hover 时右上角显示编辑/删除按钮，✎ 进入「就地编辑」模式：
 *   - 同时编辑「标题」和「URL」两个字段
 *   - 编辑时禁用 dnd 拖拽与整卡 click（避免干扰输入）
 *   - Enter 保存 / Esc 取消
 * - 底部备注区始终可见（描述/Description）：
 *   - 已有备注 → 直接展示备注文本（最多 2 行），点击进入编辑
 *   - 无备注  → 展示低调的「+ 添加备注」占位按钮
 */
export function BookmarkCardItem({ card, draggable = true }: Props) {
  const removeCard = useBookmarkStore((s) => s.removeCard)
  const updateCard = useBookmarkStore((s) => s.updateCard)
  const recordRecentOpen = useBookmarkStore((s) => s.recordRecentOpen)

  // disabled 让 useSortable 不响应拖拽，但仍保留 ref 用于其他逻辑（最近使用模块场景）
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id, disabled: !draggable })

  const cardRef = useRef<HTMLDivElement | null>(null)
  const draggedRecently = useRef(false)

  // 就地编辑状态
  const [editing, setEditing] = useState(false)
  const [draftTitle, setDraftTitle] = useState(card.title)
  const [draftUrl, setDraftUrl] = useState(card.url)
  const [draftIcon, setDraftIcon] = useState<string | undefined>(card.icon)
  const titleInputRef = useRef<HTMLInputElement | null>(null)

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

  // 进入编辑模式时聚焦标题
  useEffect(() => {
    if (editing) titleInputRef.current?.focus()
  }, [editing])

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const openUrl = () => {
    if (draggedRecently.current) return
    // 记录"最近使用"——这是用户在本扩展内主动打开书签的唯一入口
    void recordRecentOpen(card.id)
    window.open(card.url, '_blank', 'noopener,noreferrer')
  }

  const startEdit = () => {
    setDraftTitle(card.title)
    setDraftUrl(card.url)
    setDraftIcon(card.icon)
    setEditing(true)
  }
  const cancelEdit = () => {
    setEditing(false)
  }
  const saveEdit = async () => {
    const title = draftTitle.trim()
    const url = draftUrl.trim()
    if (!title || !url) return
    // 没有任何变化时直接退出，不写库
    if (title === card.title && url === card.url && draftIcon === card.icon) {
      setEditing(false)
      return
    }
    await updateCard(card.id, { title, url, icon: draftIcon })
    setEditing(false)
  }

  const handleEditNote = () => {
    const next = window.prompt(
      card.description ? '编辑备注' : '为该书签添加备注',
      card.description ?? '',
    )
    if (next === null) return
    void updateCard(card.id, { description: next.trim() || undefined })
  }

  const handleDelete = () => {
    if (window.confirm(`删除「${card.title}」？`)) void removeCard(card.id)
  }

  // 编辑模式下：解绑 dnd 拖拽 listeners、禁用整卡 click
  // draggable=false 时也不绑定（避免 sortable 的视觉抖动 / 无意义事件）
  const dragProps = editing || !draggable ? {} : { ...attributes, ...listeners }
  const canSave =
    draftTitle.trim().length > 0 &&
    draftUrl.trim().length > 0 &&
    (
      draftTitle.trim() !== card.title ||
      draftUrl.trim() !== card.url ||
      draftIcon !== card.icon
    )

  return (
    <div
      ref={setRefs}
      style={style}
      {...dragProps}
      onClick={(e) => {
        if (editing) return
        if (e.defaultPrevented) return
        openUrl()
      }}
      className={cn(
        'card group p-3 select-none',
        'flex flex-col gap-2',
        editing
          ? 'cursor-default min-h-24 ring-2 ring-brand/40 shadow-md'
          : 'cursor-pointer h-24 hover:border-brand/40 hover:shadow-brand/10',
      )}
      title={editing ? undefined : `点击打开：${card.url}`}
    >
      {/* 顶部：图标 + 标题/域名（或编辑表单） + hover 操作 */}
      <div className="flex items-start gap-2">
        {editing ? (
          <div
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <IconPicker
              value={draftIcon}
              defaultEmoji="🔗"
              onChange={(icon) => setDraftIcon(icon)}
              trigger={(open) => (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); open() }}
                  title="点击修改图标"
                  className={cn(
                    'w-8 h-8 rounded shrink-0 flex items-center justify-center',
                    'bg-slate-100 dark:bg-slate-700 hover:ring-2 hover:ring-brand/40 transition',
                  )}
                >
                  <CardIconView
                    icon={draftIcon}
                    fallbackUrl={draftUrl || card.url}
                  />
                </button>
              )}
            />
          </div>
        ) : (
          <div
            className={cn(
              'w-8 h-8 rounded shrink-0 flex items-center justify-center',
              'bg-slate-100 dark:bg-slate-700',
            )}
          >
            <CardIconView icon={card.icon} fallbackUrl={card.url} />
          </div>
        )}

        {editing ? (
          <div className="flex-1 min-w-0 flex flex-col gap-1.5">
            <input
              ref={titleInputRef}
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter') void saveEdit()
                if (e.key === 'Escape') cancelEdit()
              }}
              placeholder="标题"
              className={cn(
                'w-full text-sm font-medium px-2 py-1 rounded',
                'bg-white dark:bg-slate-900',
                'border border-slate-200 dark:border-slate-700',
                'focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand/30',
              )}
            />
            <input
              value={draftUrl}
              onChange={(e) => setDraftUrl(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter') void saveEdit()
                if (e.key === 'Escape') cancelEdit()
              }}
              placeholder="https://..."
              spellCheck={false}
              className={cn(
                'w-full text-xs px-2 py-1 rounded font-mono',
                'bg-white dark:bg-slate-900',
                'border border-slate-200 dark:border-slate-700',
                'focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand/30',
              )}
            />
          </div>
        ) : (
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate" title={card.title}>
              {card.title}
            </div>
            <div className="text-xs text-slate-400 truncate">
              {getHostname(card.url)}
            </div>
          </div>
        )}

        {!editing && (
          <div
            className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0"
            // 菜单触发器自身不应触发卡片打开
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <CardMenu
              ariaLabel={`书签「${card.title}」操作菜单`}
              items={[
                {
                  key: 'edit',
                  label: '编辑',
                  icon: <MenuIcons.Edit />,
                  onSelect: startEdit,
                },
                {
                  key: 'note',
                  label: card.description ? '编辑备注' : '添加备注',
                  icon: <MenuIcons.Note />,
                  onSelect: handleEditNote,
                },
                {
                  key: 'delete',
                  label: '删除',
                  icon: <MenuIcons.Trash />,
                  danger: true,
                  onSelect: handleDelete,
                } satisfies CardMenuItem,
              ]}
            />
          </div>
        )}
      </div>

      {/* 底部区：编辑模式 → 保存/取消；非编辑 → 备注 */}
      <div className="mt-auto">
        {editing ? (
          <div className="flex items-center justify-end gap-1.5 pt-1">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); cancelEdit() }}
              onPointerDown={(e) => e.stopPropagation()}
              className={cn(
                'px-2.5 py-1 rounded text-xs',
                'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700',
              )}
            >取消</button>
            <button
              type="button"
              disabled={!canSave}
              onClick={(e) => { e.stopPropagation(); void saveEdit() }}
              onPointerDown={(e) => e.stopPropagation()}
              className={cn(
                'px-2.5 py-1 rounded text-xs font-medium',
                canSave
                  ? 'bg-brand text-white hover:bg-brand-600'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed dark:bg-slate-700 dark:text-slate-500',
              )}
            >保存</button>
          </div>
        ) : card.description ? (
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
              // 仅 hover 卡片时显示，避免空状态干扰阅读
              'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
              'transition-opacity',
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

/**
 * 卡片图标统一渲染：
 * - 用户自定义 icon 是 emoji/字符 → 文本展示
 * - 用户自定义 icon 是 https:// 或 data:image/ → 图片展示
 * - 没设置 → 走 favicon（基于 fallbackUrl）
 */
function CardIconView({
  icon,
  fallbackUrl,
}: {
  icon?: string
  fallbackUrl: string
}) {
  if (icon && !isImageIcon(icon)) {
    // emoji / 文本
    return (
      <span className="text-xl leading-none select-none" aria-hidden>
        {icon}
      </span>
    )
  }
  // 用户上传了图片图标 → 直接渲染（失败时 hidden 兜底，与之前行为一致）
  if (icon) {
    return (
      <img
        src={icon}
        alt=""
        className="w-7 h-7 rounded-sm object-contain"
        onError={(e) => {
          ;(e.currentTarget as HTMLImageElement).style.visibility = 'hidden'
        }}
      />
    )
  }
  // 没设置 icon → 走 favicon；失败时显示域名首字母占位块（FaviconImg 内置）
  return (
    <FaviconImg
      url={fallbackUrl}
      size={28}
      className="w-7 h-7 rounded-sm object-contain"
      fallbackClassName="w-7 h-7 rounded-sm text-xs"
    />
  )
}
