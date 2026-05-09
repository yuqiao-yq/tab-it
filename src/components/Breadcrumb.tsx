import { useMemo } from 'react'
import type { Category } from '../types/bookmark'
import { useBookmarkStore } from '../stores/useBookmarkStore'

/**
 * 面包屑导航
 * 根据 activeCategoryId 向上追溯到根，展示完整路径。
 * 点击某一节点可跳转到该层。
 */
export function Breadcrumb() {
  const categories = useBookmarkStore((s) => s.categories)
  const activeId = useBookmarkStore((s) => s.activeCategoryId)
  const setActive = useBookmarkStore((s) => s.setActiveCategory)

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

  // 只有一层（顶层分类）时，面包屑没有意义，不显示
  if (path.length <= 1) return null

  return (
    <nav className="flex items-center gap-1 px-1 mb-4 text-sm flex-wrap">
      {path.map((cat, i) => {
        const isLast = i === path.length - 1
        return (
          <span key={cat.id} className="flex items-center gap-1">
            {i > 0 && (
              <span className="text-slate-300 dark:text-slate-600 select-none">›</span>
            )}
            {isLast ? (
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {cat.name}
              </span>
            ) : (
              <button
                onClick={() => setActive(cat.id)}
                className="text-brand hover:text-brand-600 hover:underline transition-colors"
              >
                {cat.name}
              </button>
            )}
          </span>
        )
      })}
    </nav>
  )
}
