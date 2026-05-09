import { useState } from 'react'
import type { Category } from '../types/bookmark'
import { useBookmarkStore } from '../stores/useBookmarkStore'
import { cn } from '../utils/cn'

// 每次 UI 改动时手动 +1，便于在页面右下角确认"是否加载到最新代码"
const SIDEBAR_BUILD_TAG = 'v3-always-plus'

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

  // 折叠整个侧栏
  const [collapsed, setCollapsed] = useState(false)
  // 过渡期间显示彩光
  const [animating, setAnimating] = useState(false)
  // 树形节点的展开状态：存储已展开的分类 ID
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const handleToggle = () => {
    setAnimating(true)
    setCollapsed((v) => !v)
  }

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const topLevel = categories.filter((c) => !c.parentId).sort((a, b) => a.order - b.order)

  const childrenOf = (id: string) =>
    categories.filter((c) => c.parentId === id).sort((a, b) => a.order - b.order)

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
  const handleAddSub = async (parent: Category) => {
    const name = window.prompt(`在「${parent.name}」下新建子分类`)
    if (!name?.trim()) return
    await addCategory(name.trim(), undefined, parent.id)
    // 自动展开父级，让新创建的子分类立刻可见
    setExpanded((prev) => new Set(prev).add(parent.id))
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

  // 是否存在任何"有子分类"的分类（用于显示/禁用一键展开按钮）
  const allParentIds = categories
    .filter((c) => categories.some((x) => x.parentId === c.id))
    .map((c) => c.id)
  const hasAnyChildren = allParentIds.length > 0
  const allExpanded = hasAnyChildren && allParentIds.every((id) => expanded.has(id))

  /** 递归渲染树节点 */
  const renderNode = (cat: Category, depth: number): JSX.Element => {
    const children = childrenOf(cat.id)
    const hasChildren = children.length > 0
    const isExpanded = expanded.has(cat.id)
    const active = activeId === cat.id
    const isSelected = selectedIds.has(cat.id)
    // 选择模式下只允许操作顶层分类
    const checkable = !cat.parentId

    return (
      <div key={cat.id}>
        <div
          className={cn(
            'group flex items-center gap-1 pr-2 py-1.5 rounded-lg cursor-pointer transition-colors',
            selectMode
              ? checkable
                ? isSelected ? 'bg-brand/10 dark:bg-brand/20' : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                : 'opacity-50 cursor-default'
              : active ? 'bg-brand text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800',
          )}
          style={{ paddingLeft: 4 + depth * 12 }}
          onClick={() => {
            if (selectMode) { if (checkable) toggleSelect(cat.id); return }
            setActive(cat.id)
            // 点击有子节点的分类时自动展开，方便一次性看到下级
            if (hasChildren && !isExpanded) toggleExpand(cat.id)
          }}
        >
          {/* 展开/折叠按钮（无子节点时占位保持对齐） */}
          {hasChildren ? (
            <button
              className={cn(
                'w-5 h-5 flex items-center justify-center text-[11px] shrink-0 leading-none rounded',
                'transition-transform duration-150 font-bold',
                isExpanded ? 'rotate-90' : '',
                !selectMode && active
                  ? 'text-white hover:bg-white/20'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-700',
              )}
              onClick={(e) => { e.stopPropagation(); toggleExpand(cat.id) }}
              title={isExpanded ? '折叠子分类' : '展开子分类'}
            >
              ▶
            </button>
          ) : (
            <span className="w-5 shrink-0" />
          )}

          {selectMode && checkable ? (
            <span className={cn(
              'w-4 h-4 rounded border flex items-center justify-center text-[10px] shrink-0',
              isSelected ? 'bg-brand border-brand text-white' : 'border-slate-300 dark:border-slate-600'
            )}>{isSelected && '✓'}</span>
          ) : (
            <span className="shrink-0">{cat.icon ?? (depth === 0 ? '📁' : '📂')}</span>
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
            'text-xs shrink-0 tabular-nums',
            !selectMode && active ? 'text-white/70' : 'text-slate-400'
          )}>
            {countOf(cat.id)}
          </span>

          {!selectMode && (
            <>
              {/* 新建子分类（始终可见，避免 hover 不触发的不确定性） */}
              <button
                className={cn(
                  'w-5 h-5 flex items-center justify-center rounded text-base leading-none shrink-0',
                  'transition-colors',
                  active
                    ? 'text-white/70 hover:text-white hover:bg-white/20'
                    : 'text-slate-400 hover:text-brand hover:bg-slate-200/80 dark:hover:bg-slate-700',
                )}
                onClick={(e) => { e.stopPropagation(); handleAddSub(cat) }}
                title={`在「${cat.name}」下新建子分类`}
              >+</button>
              {/* 删除（hover 显示，避免误触） */}
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
            </>
          )}
        </div>

        {/* 子节点：选择模式下不展开，避免操作语义混乱 */}
        {hasChildren && isExpanded && !selectMode && (
          <div>
            {children.map((c) => renderNode(c, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <aside
      className={cn(
        'relative shrink-0 flex flex-col',
        'border-r border-slate-200/60 dark:border-slate-700/60',
        'overflow-hidden',
        // 丝滑宽度过渡
        'transition-[width] duration-300 ease-in-out',
        collapsed ? 'w-10' : 'w-60',
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
        {/* 折叠时小图标列（只显示顶层） */}
        <div className="flex flex-col gap-1 mt-1">
          {topLevel.slice(0, 6).map((cat) => {
            const inActivePath =
              activeId === cat.id ||
              collectDescendantIds([cat.id], categories).has(activeId ?? '')
            return (
              <button
                key={cat.id}
                onClick={() => { setCollapsed(false); setAnimating(true); setActive(cat.id) }}
                title={cat.name}
                className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center text-sm',
                  'transition-colors',
                  inActivePath
                    ? 'bg-brand text-white'
                    : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800',
                )}
              >
                {cat.icon ?? '📁'}
              </button>
            )
          })}
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
                  onClick={() => {
                    if (allExpanded) setExpanded(new Set())
                    else setExpanded(new Set(allParentIds))
                  }}
                  className={cn(
                    'btn-ghost !px-1.5 h-6 text-[11px] leading-none whitespace-nowrap',
                    !hasAnyChildren && 'opacity-40 cursor-not-allowed',
                  )}
                  disabled={!hasAnyChildren}
                  title={
                    !hasAnyChildren
                      ? '当前没有任何子分类，从浏览器再导入或新建子分类后即可使用'
                      : allExpanded ? '一键折叠全部子分类' : '一键展开全部子分类'
                  }
                >{allExpanded ? '全收' : '全展'}</button>
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
          {topLevel.map((cat) => renderNode(cat, 0))}
        </div>

        {/* 数据状态诊断面板：让"折叠/展开为啥没反应"一目了然 */}
        {topLevel.length > 0 && (
          <div className="mt-3 px-2 text-[11px] leading-relaxed text-slate-400 border-t border-slate-200/60 dark:border-slate-700/60 pt-2">
            <div className="flex items-center justify-between">
              <span>分类总数</span>
              <span className="tabular-nums text-slate-500">{categories.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>顶层分类</span>
              <span className="tabular-nums text-slate-500">{topLevel.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>含子分类的</span>
              <span className={cn(
                'tabular-nums',
                hasAnyChildren ? 'text-brand font-medium' : 'text-slate-400'
              )}>{allParentIds.length}</span>
            </div>
            {!hasAnyChildren && (
              <div className="mt-1.5 leading-snug">
                每行右侧的 <span className="font-bold text-slate-500">+</span> 是「新建子分类」按钮（始终可见），点一下输入名称即可，新建后会立刻出现 <span className="font-bold text-slate-500">▶</span> 折叠按钮。
              </div>
            )}
            {/* build 标记：用于判断当前页面是否加载了最新代码 */}
            <div className="mt-1.5 opacity-50 text-[10px]">
              ui-build: {SIDEBAR_BUILD_TAG}
            </div>
          </div>
        )}
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
