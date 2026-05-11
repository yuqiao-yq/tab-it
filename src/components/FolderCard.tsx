import { useEffect, useRef, useState } from 'react'
import type { Category } from '../types/bookmark'
import { useBookmarkStore } from '../stores/useBookmarkStore'
import { cn } from '../utils/cn'
import { IconPicker } from './IconPicker'
import { IconView } from '../utils/icon'
import { CardMenu, MenuIcons } from './CardMenu'

interface Props {
  category: Category
}

/**
 * 文件夹卡片：在内容区展示子分类，点击进入该分类层级。
 * 不参与拖拽排序（区别于书签卡片）。
 *
 * 交互：
 * - 左上角图标 → 点击弹出 IconPicker（emoji / URL / 上传），不会触发"打开文件夹"
 * - 右上角 ⋮ → 重命名 / 删除
 * - 重命名：与书签卡片同款的"就地编辑"——名称变成 input，
 *   Enter 保存 / Esc 取消 / blur 保存；编辑期间卡片 click 被禁用，避免误打开
 */
export function FolderCard({ category }: Props) {
  const setActive = useBookmarkStore((s) => s.setActiveCategory)
  const cards = useBookmarkStore((s) => s.cards)
  const categories = useBookmarkStore((s) => s.categories)
  const removeCategory = useBookmarkStore((s) => s.removeCategory)
  const updateCategory = useBookmarkStore((s) => s.updateCategory)

  // 该文件夹下的直接书签数 + 子文件夹数
  const directCards = cards.filter((c) => c.categoryId === category.id).length
  const subFolders = categories.filter((c) => c.parentId === category.id).length

  // ─── 就地重命名 ───────────────────────────────
  const [renaming, setRenaming] = useState(false)
  const [draftName, setDraftName] = useState(category.name)
  const nameInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (renaming) {
      // focus 后整段高亮，方便直接覆盖输入
      nameInputRef.current?.focus()
      nameInputRef.current?.select()
    }
  }, [renaming])

  const startRename = () => {
    setDraftName(category.name)
    setRenaming(true)
  }
  const cancelRename = () => {
    setDraftName(category.name)
    setRenaming(false)
  }
  const commitRename = () => {
    const name = draftName.trim()
    // 空名 / 无变化 → 视为取消
    if (!name || name === category.name) {
      cancelRename()
      return
    }
    void updateCategory(category.id, { name })
    setRenaming(false)
  }

  return (
    <div
      className={cn(
        'card group p-3 select-none h-28',
        'flex flex-col justify-between',
        renaming
          ? 'cursor-default ring-2 ring-brand/40 shadow-md'
          : 'cursor-pointer hover:border-brand/40 hover:shadow-brand/10',
      )}
      onClick={() => {
        if (renaming) return
        setActive(category.id)
      }}
      title={renaming ? undefined : `打开文件夹：${category.name}`}
    >
      {/* 上半：图标（点击换图标） + ⋮ 菜单 */}
      <div className="flex items-start justify-between">
        <div
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <IconPicker
            value={category.icon}
            defaultEmoji="📂"
            onChange={(icon) => void updateCategory(category.id, { icon })}
            trigger={(open) => (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); open() }}
                title="点击修改图标"
                className={cn(
                  'flex items-center justify-center w-8 h-8 rounded',
                  'hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors',
                )}
              >
                <IconView
                  value={category.icon}
                  fallback="📂"
                  emojiClassName="text-2xl leading-none"
                  imgClassName="w-7 h-7 rounded object-contain"
                />
              </button>
            )}
          />
        </div>
        {!renaming && (
          <div
            className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <CardMenu
              ariaLabel={`文件夹「${category.name}」操作菜单`}
              items={[
                {
                  key: 'rename',
                  label: '重命名',
                  icon: <MenuIcons.Edit />,
                  onSelect: startRename,
                },
                {
                  key: 'delete',
                  label: '删除',
                  icon: <MenuIcons.Trash />,
                  danger: true,
                  onSelect: () => {
                    const hasChildren = categories.some(
                      (c) => c.parentId === category.id,
                    )
                    const msg = hasChildren
                      ? `删除文件夹「${category.name}」及其所有子文件夹和书签？`
                      : `删除文件夹「${category.name}」及其下所有书签？`
                    if (window.confirm(msg)) void removeCategory(category.id)
                  },
                },
              ]}
            />
          </div>
        )}
      </div>

      {/* 下半：名称（或就地编辑 input） + 数量 */}
      <div>
        {renaming ? (
          <input
            ref={nameInputRef}
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onBlur={commitRename}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') cancelRename()
            }}
            placeholder="文件夹名称"
            className={cn(
              'w-full text-sm font-medium px-2 py-1 rounded',
              'bg-white dark:bg-slate-900',
              'border border-slate-200 dark:border-slate-700',
              'focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand/30',
            )}
          />
        ) : (
          <div className="text-sm font-medium truncate" title={category.name}>
            {category.name}
          </div>
        )}
        <div className="text-xs text-slate-400 mt-0.5">
          {[
            subFolders > 0 && `${subFolders} 个文件夹`,
            directCards > 0 && `${directCards} 个书签`,
          ].filter(Boolean).join(' · ') || '空'}
        </div>
      </div>
    </div>
  )
}
