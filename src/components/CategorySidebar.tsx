import { useState } from 'react'
import type { Category } from '../types/bookmark'
import { useBookmarkStore } from '../stores/useBookmarkStore'
import { cn } from '../utils/cn'

export function CategorySidebar() {
  const categories = useBookmarkStore((s) => s.categories)
  const cards = useBookmarkStore((s) => s.cards)
  const activeId = useBookmarkStore((s) => s.activeCategoryId)
  const setActive = useBookmarkStore((s) => s.setActiveCategory)
  const addCategory = useBookmarkStore((s) => s.addCategory)
  const renameCategory = useBookmarkStore((s) => s.renameCategory)
  const removeCategory = useBookmarkStore((s) => s.removeCategory)
  const removeCategories = useBookmarkStore((s) => s.removeCategories)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // 折叠状态
  const [collapsed, setCollapsed] = useState(false)
  // 过渡期间显示彩光
  const [animating, setAnimating] = useState(false)

  const handleToggle = () => {
    setAnimating(true)
    setCollapsed((v) => !v)
  }

  const topLevel = categories.filter((c) => !c.parentId).sort((a, b) => a.order - b.order)

  const countOf = (id: string): number => {
    const subIds = categories.filter((c) => c.parentId === id).map((c) => c.id)
    const direct = cards.filter((c) => c.categoryId === id).length
    return direct + subIds.reduce((sum, sid) => sum + countOf(sid), 0)
  }

  const handleAdd = async () => {
    const name = window.prompt('新分类名称')
    if (!name?.trim()) return
    await addCategory(name.trim())
  }
  const startEdit = (id: string, name: string) => { setEditingId(id); setEditingName(name) }
  const commitEdit = async () => {
    if (editingId && editingName.trim()) await renameCategory(editingId, editingName.trim())
    setEditingId(null)
  }

  const enterSelectMode = () => { setSelectMode(true); setSelectedIds(new Set()) }
  const exitSelectMode = () => { setSelectMode(false); setSelectedIds(new Set()) }
  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleSelectAll = () =>
    setSelectedIds(selectedIds.size === topLevel.length ? new Set() : new Set(topLevel.map((c) => c.id)))
  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return
    const allIds = collectDescendantIds(Array.from(selectedIds), categories)
    const totalCards = cards.filter((c) => allIds.has(c.categoryId)).length
    if (!window.confirm(`确定删除 ${allIds.size} 个分类（含子分类）、${totalCards} 个卡片吗？`)) return
    await removeCategories(Array.from(selectedIds))
    exitSelectMode()
  }

  const allSelected = selectedIds.size === topLevel.length && topLevel.length > 0
  const isActiveUnder = (topCat: Category): boolean => {
    if (activeId === topCat.id) return true
    return collectDescendantIds([topCat.id], categories).has(activeId ?? '')
  }

  return (
    <aside
      className={cn(
        'relative shrink-0 flex flex-col',
        'border-r border-slate-200/60 dark:border-slate-700/60',
        'overflow-hidden',
        // 丝滑宽度过渡
        'transition-[width] duration-300 ease-in-out',
        collapsed ? 'w-10' : 'w-56',
      )}
      onTransitionEnd={() => setAnimating(false)}
    >
      {/* ── 流动彩光边缘 ───────────────────────────────────── */}
      <div
        className={cn(
          'sidebar-glow-edge animate-glow-flow',
          'absolute right-0 top-0 h-full w-[2px] pointer-events-none z-20',
          'transition-opacity duration-200',
          animating ? 'opacity-60' : 'opacity-0',
        )}
      />

      {/* ── 折叠状态：展开按钮 ─────────────────────────────── */}
      <div
        className={cn(
          'absolute inset-0 flex flex-col items-center pt-3 gap-2 z-10',
          'transition-opacity duration-100',
          collapsed ? 'opacity-100 delay-150' : 'opacity-0 pointer-events-none',
        )}
      >
        {/* 展开箭头 */}
        <button
          onClick={handleToggle}
          title="展开分类栏"
          className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center',
            'text-slate-500 hover:text-brand hover:bg-slate-100',
            'dark:hover:text-brand dark:hover:bg-slate-800',
            'transition-colors text-base font-light',
          )}
        >
          ›
        </button>
        {/* 折叠时小图标列 */}
        <div className="flex flex-col gap-1 mt-1">
          {topLevel.slice(0, 6).map((cat) => (
            <button
              key={cat.id}
              onClick={() => { setCollapsed(false); setAnimating(true); setActive(cat.id) }}
              title={cat.name}
              className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center text-sm',
                'transition-colors',
                isActiveUnder(cat)
                  ? 'bg-brand text-white'
                  : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800',
              )}
            >
              {cat.icon ?? '📁'}
            </button>
          ))}
        </div>
      </div>

      {/* ── 主内容（展开时显示） ────────────────────────────── */}
      <div
        className={cn(
          'flex flex-col flex-1 min-h-0 p-3',
          'transition-opacity',
          collapsed
            ? 'opacity-0 pointer-events-none duration-100'
            : 'opacity-100 duration-200 delay-150',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-2 mb-2 h-7">
          {selectMode ? (
            <>
              <span className="text-xs font-semibold text-brand">已选 {selectedIds.size}</span>
              <div className="flex items-center gap-0.5">
                <button onClick={toggleSelectAll} className="btn-ghost !p-1 text-xs">
                  {allSelected ? '✕全' : '✓全'}
                </button>
                <button
                  onClick={handleBatchDelete}
                  disabled={selectedIds.size === 0}
                  className={cn('btn-ghost !p-1 text-xs',
                    selectedIds.size > 0
                      ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
                      : 'opacity-40 cursor-not-allowed'
                  )}
                >🗑</button>
                <button onClick={exitSelectMode} className="btn-ghost !p-1 text-xs">完成</button>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                分类
              </h2>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={enterSelectMode}
                  className="btn-ghost !p-1 h-6 w-6 text-xs"
                  disabled={topLevel.length === 0}
                  title="批量管理"
                >⚙</button>
                <button
                  onClick={handleAdd}
                  className="btn-ghost !p-1 h-6 w-6 text-base leading-none"
                  title="新建顶层分类"
                >+</button>
                {/* 收起按钮 */}
                <button
                  onClick={handleToggle}
                  className="btn-ghost !p-1 h-6 w-6 text-base leading-none"
                  title="收起分类栏"
                >‹</button>
              </div>
            </>
          )}
        </div>

        {topLevel.length === 0 && (
          <div className="px-2 py-4 text-sm text-slate-400">还没有分类</div>
        )}

        <div className="flex flex-col gap-0.5 overflow-y-auto">
          {topLevel.map((cat) => {
            const active = isActiveUnder(cat)
            const isSelected = selectedIds.has(cat.id)
            const hasChildren = categories.some((c) => c.parentId === cat.id)

            return (
              <div
                key={cat.id}
                className={cn(
                  'group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors',
                  selectMode
                    ? isSelected ? 'bg-brand/10 dark:bg-brand/20' : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                    : active ? 'bg-brand text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                )}
                onClick={() => selectMode ? toggleSelect(cat.id) : setActive(cat.id)}
              >
                {selectMode ? (
                  <span className={cn(
                    'w-4 h-4 rounded border flex items-center justify-center text-[10px] shrink-0',
                    isSelected ? 'bg-brand border-brand text-white' : 'border-slate-300 dark:border-slate-600'
                  )}>{isSelected && '✓'}</span>
                ) : (
                  <span className="shrink-0">{cat.icon ?? '📁'}</span>
                )}

                {editingId === cat.id ? (
                  <input
                    autoFocus
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitEdit()
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 min-w-0 bg-transparent outline-none text-sm"
                  />
                ) : (
                  <span
                    className="flex-1 min-w-0 text-sm truncate"
                    title={cat.name}
                    onDoubleClick={(e) => {
                      if (selectMode) return
                      e.stopPropagation()
                      startEdit(cat.id, cat.name)
                    }}
                  >{cat.name}</span>
                )}

                <span className={cn(
                  'text-xs shrink-0',
                  !selectMode && active ? 'text-white/70' : 'text-slate-400'
                )}>
                  {countOf(cat.id)}
                </span>

                {!selectMode && (
                  <button
                    className={cn(
                      'opacity-0 group-hover:opacity-100 transition-opacity text-xs px-0.5 shrink-0',
                      active ? 'text-white/80' : 'text-slate-400 hover:text-red-500'
                    )}
                    onClick={async (e) => {
                      e.stopPropagation()
                      const msg = hasChildren
                        ? `删除「${cat.name}」及其所有子文件夹和书签？`
                        : `删除「${cat.name}」及其下所有书签？`
                      if (window.confirm(msg)) await removeCategory(cat.id)
                    }}
                    title="删除"
                  >✕</button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </aside>
  )
}

function collectDescendantIds(ids: string[], allCats: Category[]): Set<string> {
  const result = new Set(ids)
  const queue = [...ids]
  while (queue.length > 0) {
    const pid = queue.shift()!
    for (const c of allCats) {
      if (c.parentId === pid && !result.has(c.id)) { result.add(c.id); queue.push(c.id) }
    }
  }
  return result
}
