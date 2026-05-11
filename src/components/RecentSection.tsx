import { useMemo, useState } from 'react'
import { useBookmarkStore } from '../stores/useBookmarkStore'
import { BookmarkCardItem } from './BookmarkCardItem'
import { cn } from '../utils/cn'

const GRID_COLS =
  'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3'

/**
 * 最近使用 模块：常驻在主页面顶部（搜索模式与无激活分类时不渲染）
 *
 * 行为与 CategorySection 对齐：
 * - 头部：折叠按钮 ▸ + 「最近使用」标题 + 计数 + 设置 N + 清空
 * - 卡片：复用 BookmarkCardItem，但 draggable=false（顺序由打开时间决定）
 * - 数据来自 store.recentEntries（按 openedAt 倒序）；切片到 recentLimit
 *
 * N（recentLimit）通过 store.setRecentLimit 持久化；UI 用 prompt 获取，
 * 后续若要做更精致的设置面板，只需替换交互不影响数据流。
 */
export function RecentSection() {
  const recentEntries = useBookmarkStore((s) => s.recentEntries)
  const recentLimit = useBookmarkStore((s) => s.recentLimit)
  const setRecentLimit = useBookmarkStore((s) => s.setRecentLimit)
  const clearRecent = useBookmarkStore((s) => s.clearRecent)
  const cards = useBookmarkStore((s) => s.cards)

  const [collapsed, setCollapsed] = useState(false)

  // 取最近 N 条，并解引用到具体卡片对象（已删除的卡片自动跳过）
  const visibleCards = useMemo(() => {
    const map = new Map(cards.map((c) => [c.id, c]))
    const result = []
    for (const entry of recentEntries) {
      const card = map.get(entry.cardId)
      if (card) result.push(card)
      if (result.length >= recentLimit) break
    }
    return result
  }, [recentEntries, recentLimit, cards])

  const handleConfigLimit = async () => {
    const next = window.prompt(
      '最近使用模块要展示几个网页？(1 ~ 100)',
      String(recentLimit),
    )
    if (next === null) return
    const n = parseInt(next.trim(), 10)
    if (!Number.isFinite(n) || n <= 0) {
      window.alert('请输入大于 0 的整数')
      return
    }
    await setRecentLimit(n)
  }

  const handleClear = async () => {
    if (recentEntries.length === 0) return
    if (!window.confirm('确定清空最近使用记录吗？')) return
    await clearRecent()
  }

  return (
    <section className="mb-6">
      {/* Header：与 CategorySection 子 section 视觉一致，但携带"设置 N / 清空" */}
      <header className="flex items-center gap-2 mb-3 group/sec">
        <button
          onClick={() => setCollapsed((v) => !v)}
          title={collapsed ? '展开' : '折叠'}
          className={cn(
            'w-5 h-5 flex items-center justify-center text-[10px] rounded',
            'text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800',
            'transition-transform duration-150',
            collapsed ? '' : 'rotate-90',
          )}
        >
          ▸
        </button>
        <span className="text-base leading-none">🕒</span>
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
          最近使用
        </span>
        <span className="text-xs text-slate-400 tabular-nums">
          {visibleCards.length > 0
            ? `${visibleCards.length} / ${recentLimit}`
            : `0 / ${recentLimit}`}
        </span>
        <div className="flex-1 border-t border-dashed border-slate-200 dark:border-slate-700 ml-2" />
        <button
          onClick={handleConfigLimit}
          className="opacity-0 group-hover/sec:opacity-100 transition-opacity btn-ghost !p-1 h-6 px-1.5 text-[11px] leading-none whitespace-nowrap"
          title="设置展示数量"
        >
          N={recentLimit}
        </button>
        <button
          onClick={handleClear}
          disabled={recentEntries.length === 0}
          className={cn(
            'opacity-0 group-hover/sec:opacity-100 transition-opacity btn-ghost !p-1 h-6 w-6 text-xs',
            recentEntries.length === 0 && 'cursor-not-allowed opacity-30',
          )}
          title="清空最近使用"
        >
          🗑
        </button>
      </header>

      {!collapsed && (
        <>
          {visibleCards.length > 0 ? (
            <div className={GRID_COLS}>
              {visibleCards.map((card) => (
                <BookmarkCardItem
                  key={`recent-${card.id}`}
                  card={card}
                  draggable={false}
                />
              ))}
            </div>
          ) : (
            <div className="text-xs text-slate-400 pl-7 py-1">
              点击任意书签后会出现在这里
            </div>
          )}
        </>
      )}
    </section>
  )
}
