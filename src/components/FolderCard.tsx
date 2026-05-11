import type { Category } from '../types/bookmark'
import { useBookmarkStore } from '../stores/useBookmarkStore'
import { cn } from '../utils/cn'
import { IconPicker } from './IconPicker'
import { IconView } from '../utils/icon'

interface Props {
  category: Category
}

/**
 * 文件夹卡片：在内容区展示子分类，点击进入该分类层级。
 * 不参与拖拽排序（区别于书签卡片）。
 *
 * 左上角图标：点击弹出 IconPicker（emoji / URL / 上传），不会触发"打开文件夹"。
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

  return (
    <div
      className={cn(
        'card group p-3 cursor-pointer select-none h-28',
        'flex flex-col justify-between',
        'hover:border-brand/40 hover:shadow-brand/10'
      )}
      onClick={() => setActive(category.id)}
      title={`打开文件夹：${category.name}`}
    >
      {/* 上半：图标（点击换图标） + 删除按钮 */}
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
        <button
          className="opacity-0 group-hover:opacity-100 transition-opacity text-xs text-slate-400 hover:text-red-500 px-1"
          onClick={async (e) => {
            e.stopPropagation()
            const hasChildren = categories.some((c) => c.parentId === category.id)
            const msg = hasChildren
              ? `删除文件夹「${category.name}」及其所有子文件夹和书签？`
              : `删除文件夹「${category.name}」及其下所有书签？`
            if (window.confirm(msg)) await removeCategory(category.id)
          }}
          title="删除"
        >✕</button>
      </div>

      {/* 下半：名称 + 数量 */}
      <div>
        <div className="text-sm font-medium truncate" title={category.name}>
          {category.name}
        </div>
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
