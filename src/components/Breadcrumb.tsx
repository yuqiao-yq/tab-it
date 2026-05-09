import { useMemo } from 'react'
import type { Category } from '../types/bookmark'
import { useBookmarkStore } from '../stores/useBookmarkStore'
import { cn } from '../utils/cn'

/**
 * 面包屑栏（常驻显示）
 * - 左侧：从根到当前分类的完整路径，可点击跳转层级
 * - 右侧：书签搜索框（与左侧 space-between 布局）
 *
 * 当前没有任何选中分类时不渲染（外层不会调用）。
 */
export function Breadcrumb() {
  const categories = useBookmarkStore((s) => s.categories)
  const activeId = useBookmarkStore((s) => s.activeCategoryId)
  const setActive = useBookmarkStore((s) => s.setActiveCategory)
  const keyword = useBookmarkStore((s) => s.searchKeyword)
  const setKeyword = useBookmarkStore((s) => s.setSearchKeyword)

  // 从当前分类向上追溯，构建路径数组（从根到当前）
  const path = useMemo<Category[]>(() => {
    if (!activeId) return []
    const map = new Map(categories.map((c) => [c.id, c]))
    const result: Category[] = []
    let cur = map.get(activeId)
    while (cur) {
      result.unshift(cur)
      cur = cur.parentId ? map.get(cur.parentId) : undefined
    }
    return result
  }, [activeId, categories])

  return (
    <div className="flex items-center justify-between gap-3 px-1 mb-4">
      {/* 左：面包屑路径（顶层时只展示当前分类名） */}
      <nav className="flex items-center gap-1 text-sm flex-wrap min-w-0">
        {path.map((cat, i) => {
          const isLast = i === path.length - 1
          return (
            <span key={cat.id} className="flex items-center gap-1">
              {i > 0 && (
                <span className="text-slate-300 dark:text-slate-600 select-none">›</span>
              )}
              {isLast ? (
                <span className="font-medium text-slate-700 dark:text-slate-200 truncate">
                  {cat.icon ? <span className="mr-1">{cat.icon}</span> : null}
                  {cat.name}
                </span>
              ) : (
                <button
                  onClick={() => setActive(cat.id)}
                  className="text-brand hover:text-brand-600 hover:underline transition-colors truncate"
                >
                  {cat.name}
                </button>
              )}
            </span>
          )
        })}
      </nav>

      {/* 右：书签搜索框 */}
      <div className="relative shrink-0">
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜索书签…"
          className={cn(
            'w-56 sm:w-64 pl-8 pr-7 py-1.5 rounded-md text-sm',
            'border border-slate-200 dark:border-slate-700',
            'bg-white/60 dark:bg-slate-800/60 backdrop-blur',
            'outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all',
            'placeholder:text-slate-400',
          )}
        />
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">
          🔍
        </span>
        {keyword && (
          <button
            type="button"
            onClick={() => setKeyword('')}
            className={cn(
              'absolute right-1.5 top-1/2 -translate-y-1/2',
              'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200',
              'text-xs px-1 leading-none',
            )}
            title="清空搜索"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  )
}
