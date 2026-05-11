import { useRef, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
  type DragMoveEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Category } from '../types/bookmark'
import { useBookmarkStore } from '../stores/useBookmarkStore'
import { cn } from '../utils/cn'
import { IconPicker } from './IconPicker'
import { IconView } from '../utils/icon'

// 每次 UI 改动时手动 +1，便于在页面右下角确认"是否加载到最新代码"
const SIDEBAR_BUILD_TAG = 'v5-cross-level-dnd'

// 拖到一行的"上 30% / 中 40% / 下 30%"分别表示三种放置语义
type DropPosition = 'before' | 'after' | 'inside'
interface OverInfo {
  id: string
  position: DropPosition
}

export function CategorySidebar() {
  const categories = useBookmarkStore((s) => s.categories)
  const cards = useBookmarkStore((s) => s.cards)
  const activeId = useBookmarkStore((s) => s.activeCategoryId)
  const setActive = useBookmarkStore((s) => s.setActiveCategory)
  const addCategory = useBookmarkStore((s) => s.addCategory)
  const renameCategory = useBookmarkStore((s) => s.renameCategory)
  const removeCategory = useBookmarkStore((s) => s.removeCategory)
  const removeCategories = useBookmarkStore((s) => s.removeCategories)
  const updateCategory = useBookmarkStore((s) => s.updateCategory)
  const moveCategory = useBookmarkStore((s) => s.moveCategory)

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

  const topLevel = categories
    .filter((c) => !c.parentId)
    .sort((a, b) => a.order - b.order)

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
  const startEdit = (id: string, name: string) => {
    setEditingId(id)
    setEditingName(name)
  }
  const commitEdit = async () => {
    if (editingId && editingName.trim())
      await renameCategory(editingId, editingName.trim())
    setEditingId(null)
  }

  const enterSelectMode = () => {
    setSelectMode(true)
    setSelectedIds(new Set())
  }
  const exitSelectMode = () => {
    setSelectMode(false)
    setSelectedIds(new Set())
  }
  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  const toggleSelectAll = () =>
    setSelectedIds(
      selectedIds.size === topLevel.length
        ? new Set()
        : new Set(topLevel.map((c) => c.id)),
    )
  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return
    const allIds = collectDescendantIds(Array.from(selectedIds), categories)
    const totalCards = cards.filter((c) => allIds.has(c.categoryId)).length
    if (
      !window.confirm(
        `确定删除 ${allIds.size} 个分类（含子分类）、${totalCards} 个卡片吗？`,
      )
    )
      return
    await removeCategories(Array.from(selectedIds))
    exitSelectMode()
  }

  const allSelected = selectedIds.size === topLevel.length && topLevel.length > 0

  // 是否存在任何"有子分类"的分类（用于显示/禁用一键展开按钮）
  const allParentIds = categories
    .filter((c) => categories.some((x) => x.parentId === c.id))
    .map((c) => c.id)
  const hasAnyChildren = allParentIds.length > 0
  const allExpanded =
    hasAnyChildren && allParentIds.every((id) => expanded.has(id))

  // ─── dnd-kit ─────────────────────────────────────
  // 距离阈值 6px：避免点击进入分类时误触发拖拽
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )
  // 选择 / 重命名 模式下禁用拖拽，避免冲突
  const dragDisabled = selectMode || editingId !== null

  // 拖拽过程中目标行 + 放置位置（before/after/inside）
  // ref 用于 handleDragEnd 时拿到最新值（避免闭包 stale）
  const [overInfo, setOverInfo] = useState<OverInfo | null>(null)
  const overInfoRef = useRef<OverInfo | null>(null)
  const updateOverInfo = (next: OverInfo | null) => {
    const prev = overInfoRef.current
    if (prev === null && next === null) return
    if (
      prev &&
      next &&
      prev.id === next.id &&
      prev.position === next.position
    ) {
      return
    }
    overInfoRef.current = next
    setOverInfo(next)
  }

  /**
   * 拖动时持续计算"指针所在行的位置"——
   * 行上 30% → before，下 30% → after，中间 40% → inside（成为子节点）
   */
  const handleDragMove = (e: DragMoveEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) {
      updateOverInfo(null)
      return
    }
    const activeId = String(active.id)
    const overId = String(over.id)
    // 循环引用：禁止把节点拖到自己的后代上
    const desc = collectDescendantIds([activeId], categories)
    if (desc.has(overId)) {
      updateOverInfo(null)
      return
    }
    const activeRect = active.rect.current.translated
    const overRect = over.rect
    if (!activeRect || !overRect) return
    const center = activeRect.top + activeRect.height / 2
    const ratio = (center - overRect.top) / overRect.height
    let position: DropPosition
    if (ratio < 0.3) position = 'before'
    else if (ratio > 0.7) position = 'after'
    else position = 'inside'
    updateOverInfo({ id: overId, position })
  }

  const handleDragEnd = (e: DragEndEvent) => {
    const info = overInfoRef.current
    updateOverInfo(null)
    if (!info || !e.active) return

    const activeId = String(e.active.id)
    const activeCat = categories.find((c) => c.id === activeId)
    const overCat = categories.find((c) => c.id === info.id)
    if (!activeCat || !overCat) return
    if (activeCat.id === overCat.id) return

    // 循环引用兜底校验（store 内也会再校验一次）
    const desc = collectDescendantIds([activeId], categories)
    if (desc.has(overCat.id)) return

    if (info.position === 'inside') {
      // 嵌入：移到 overCat 下作为最后一个子节点
      const childCount = categories.filter(
        (c) => c.parentId === overCat.id && c.id !== activeId,
      ).length
      void moveCategory(activeId, overCat.id, childCount)
      // 自动展开目标节点，让放进去的子节点立刻可见
      setExpanded((prev) => new Set(prev).add(overCat.id))
      return
    }

    // before / after：插入到 overCat 所在层级（与 overCat 同父）
    const newParent = overCat.parentId
    const siblings = categories
      .filter(
        (c) => (c.parentId ?? '') === (newParent ?? '') && c.id !== activeId,
      )
      .sort((a, b) => a.order - b.order)
    const overIndex = siblings.findIndex((c) => c.id === overCat.id)
    if (overIndex < 0) return
    const newIndex = info.position === 'before' ? overIndex : overIndex + 1
    void moveCategory(activeId, newParent, newIndex)
  }

  /** 渲染某父级下的兄弟节点列表（每层一个 SortableContext） */
  const renderSiblings = (
    parentId: string | undefined,
    depth: number,
  ): JSX.Element => {
    const siblings = categories
      .filter((c) => (c.parentId ?? '') === (parentId ?? ''))
      .sort((a, b) => a.order - b.order)
    return (
      <SortableContext
        items={siblings.map((c) => c.id)}
        strategy={verticalListSortingStrategy}
      >
        {siblings.map((cat) => (
          <SortableSidebarRow
            key={cat.id}
            cat={cat}
            depth={depth}
            disabled={dragDisabled}
            dropIndicator={
              overInfo && overInfo.id === cat.id ? overInfo.position : null
            }
            renderChildren={() => renderSiblings(cat.id, depth + 1)}
            // ─── 行内交互所需上下文 ───
            activeId={activeId}
            selectMode={selectMode}
            selectedIds={selectedIds}
            editingId={editingId}
            editingName={editingName}
            expanded={expanded}
            childrenOf={childrenOf}
            countOf={countOf}
            onActivate={setActive}
            onToggleExpand={toggleExpand}
            onToggleSelect={toggleSelect}
            onStartEdit={startEdit}
            onCommitEdit={commitEdit}
            onCancelEdit={() => setEditingId(null)}
            onChangeEditingName={setEditingName}
            onIconChange={(icon) =>
              void updateCategory(cat.id, { icon })
            }
            onAddSub={handleAddSub}
            onRemove={(id) => void removeCategory(id)}
          />
        ))}
      </SortableContext>
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
                onClick={() => {
                  setCollapsed(false)
                  setAnimating(true)
                  setActive(cat.id)
                }}
                title={cat.name}
                className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center text-sm',
                  'transition-colors',
                  inActivePath
                    ? 'bg-brand text-white'
                    : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800',
                )}
              >
                <IconView
                  value={cat.icon}
                  fallback="📁"
                  emojiClassName="text-base leading-none"
                  imgClassName="w-5 h-5 rounded-sm object-contain"
                />
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
              <span className="text-xs font-semibold text-brand">
                已选 {selectedIds.size}
              </span>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={toggleSelectAll}
                  className="btn-ghost !p-1 text-xs"
                >
                  {allSelected ? '✕全' : '✓全'}
                </button>
                <button
                  onClick={handleBatchDelete}
                  disabled={selectedIds.size === 0}
                  className={cn(
                    'btn-ghost !p-1 text-xs',
                    selectedIds.size > 0
                      ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
                      : 'opacity-40 cursor-not-allowed',
                  )}
                >
                  🗑
                </button>
                <button
                  onClick={exitSelectMode}
                  className="btn-ghost !p-1 text-xs"
                >
                  完成
                </button>
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
                      : allExpanded
                        ? '一键折叠全部子分类'
                        : '一键展开全部子分类'
                  }
                >
                  {allExpanded ? '全收' : '全展'}
                </button>
                <button
                  onClick={enterSelectMode}
                  className="btn-ghost !p-1 h-6 w-6 text-xs"
                  disabled={topLevel.length === 0}
                  title="批量管理"
                >
                  ⚙
                </button>
                <button
                  onClick={handleAdd}
                  className="btn-ghost !p-1 h-6 w-6 text-base leading-none"
                  title="新建顶层分类"
                >
                  +
                </button>
                {/* 收起按钮 */}
                <button
                  onClick={handleToggle}
                  className="btn-ghost !p-1 h-6 w-6 text-base leading-none"
                  title="收起分类栏"
                >
                  ‹
                </button>
              </div>
            </>
          )}
        </div>

        {topLevel.length === 0 && (
          <div className="px-2 py-4 text-sm text-slate-400">还没有分类</div>
        )}

        {/* DndContext 包整棵分类树。各层的 SortableContext 通过 renderSiblings 生成。
            选择/重命名模式下禁用拖拽。 */}
        <div className="flex flex-col gap-0.5 overflow-y-auto">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
            onDragCancel={() => updateOverInfo(null)}
          >
            {renderSiblings(undefined, 0)}
          </DndContext>
        </div>

        {/* 数据状态诊断面板：让"折叠/展开为啥没反应"一目了然 */}
        {topLevel.length > 0 && (
          <div className="mt-3 px-2 text-[11px] leading-relaxed text-slate-400 border-t border-slate-200/60 dark:border-slate-700/60 pt-2">
            <div className="flex items-center justify-between">
              <span>分类总数</span>
              <span className="tabular-nums text-slate-500">
                {categories.length}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>顶层分类</span>
              <span className="tabular-nums text-slate-500">
                {topLevel.length}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>含子分类的</span>
              <span
                className={cn(
                  'tabular-nums',
                  hasAnyChildren ? 'text-brand font-medium' : 'text-slate-400',
                )}
              >
                {allParentIds.length}
              </span>
            </div>
            {!hasAnyChildren && (
              <div className="mt-1.5 leading-snug">
                每行右侧的{' '}
                <span className="font-bold text-slate-500">+</span>{' '}
                是「新建子分类」按钮（始终可见），点一下输入名称即可，新建后会立刻出现{' '}
                <span className="font-bold text-slate-500">▶</span> 折叠按钮。
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

// ─── Sortable 子组件 ────────────────────────────────
interface RowProps {
  cat: Category
  depth: number
  disabled: boolean
  /** 当前拖动时该行需要展示的视觉指示位置（before/after/inside）；null 不展示 */
  dropIndicator: DropPosition | null
  renderChildren: () => JSX.Element

  activeId: string | null
  selectMode: boolean
  selectedIds: Set<string>
  editingId: string | null
  editingName: string
  expanded: Set<string>

  childrenOf: (id: string) => Category[]
  countOf: (id: string) => number

  onActivate: (id: string) => void
  onToggleExpand: (id: string) => void
  onToggleSelect: (id: string) => void
  onStartEdit: (id: string, name: string) => void
  onCommitEdit: () => Promise<void> | void
  onCancelEdit: () => void
  onChangeEditingName: (v: string) => void
  onIconChange: (icon?: string) => void
  onAddSub: (parent: Category) => void
  onRemove: (id: string) => void
}

function SortableSidebarRow(props: RowProps) {
  const {
    cat,
    depth,
    disabled,
    dropIndicator,
    renderChildren,
    activeId,
    selectMode,
    selectedIds,
    editingId,
    editingName,
    expanded,
    childrenOf,
    countOf,
    onActivate,
    onToggleExpand,
    onToggleSelect,
    onStartEdit,
    onCommitEdit,
    onCancelEdit,
    onChangeEditingName,
    onIconChange,
    onAddSub,
    onRemove,
  } = props

  const children = childrenOf(cat.id)
  const hasChildren = children.length > 0
  const isExpanded = expanded.has(cat.id)
  const active = activeId === cat.id
  const isSelected = selectedIds.has(cat.id)
  const checkable = !cat.parentId

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: cat.id, disabled })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  // 阻止子按钮的 pointerdown 冒泡到 dnd-kit listeners，
  // 否则点子按钮会被识别为拖拽起点
  const stop = (e: React.SyntheticEvent) => e.stopPropagation()

  return (
    <div ref={setNodeRef} style={style} className="relative">
      {/* 拖拽放置指示线：before / after */}
      {dropIndicator === 'before' && (
        <div className="pointer-events-none absolute -top-px left-1 right-1 h-[2px] bg-brand rounded-full z-10" />
      )}
      {dropIndicator === 'after' && (
        <div className="pointer-events-none absolute -bottom-px left-1 right-1 h-[2px] bg-brand rounded-full z-10" />
      )}
      <div
        // 整行作为 drag handle；同时仍保留 onClick 走 dnd-kit 距离阈值（6px 以下触发 click）
        {...attributes}
        {...listeners}
        className={cn(
          'group flex items-center gap-1 pr-2 py-1.5 rounded-lg transition-colors',
          disabled ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing',
          selectMode
            ? checkable
              ? isSelected
                ? 'bg-brand/10 dark:bg-brand/20'
                : 'hover:bg-slate-100 dark:hover:bg-slate-800'
              : 'opacity-50 cursor-default'
            : active
              ? 'bg-brand text-white'
              : 'hover:bg-slate-100 dark:hover:bg-slate-800',
          // 嵌入指示：被拖动节点放下时会成为该行的子节点
          dropIndicator === 'inside' &&
            'ring-2 ring-brand ring-inset bg-brand/10 dark:bg-brand/20',
        )}
        style={{ paddingLeft: 4 + depth * 12 }}
        onClick={() => {
          if (selectMode) {
            if (checkable) onToggleSelect(cat.id)
            return
          }
          onActivate(cat.id)
          // 点击有子节点的分类时自动展开，方便一次性看到下级
          if (hasChildren && !isExpanded) onToggleExpand(cat.id)
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
            onClick={(e) => {
              e.stopPropagation()
              onToggleExpand(cat.id)
            }}
            onPointerDown={stop}
            title={isExpanded ? '折叠子分类' : '展开子分类'}
          >
            ▶
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}

        {selectMode && checkable ? (
          <span
            className={cn(
              'w-4 h-4 rounded border flex items-center justify-center text-[10px] shrink-0',
              isSelected
                ? 'bg-brand border-brand text-white'
                : 'border-slate-300 dark:border-slate-600',
            )}
          >
            {isSelected && '✓'}
          </span>
        ) : (
          <span
            className="shrink-0"
            onClick={stop}
            onPointerDown={stop}
          >
            <IconPicker
              value={cat.icon}
              defaultEmoji={depth === 0 ? '📁' : '📂'}
              onChange={onIconChange}
              trigger={(open) => (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    open()
                  }}
                  onPointerDown={stop}
                  title="点击修改图标"
                  className={cn(
                    'flex items-center justify-center w-5 h-5 rounded',
                    'hover:bg-slate-200/70 dark:hover:bg-slate-700/60',
                    !selectMode && active && 'hover:bg-white/20',
                  )}
                >
                  <IconView
                    value={cat.icon}
                    fallback={depth === 0 ? '📁' : '📂'}
                    emojiClassName="text-base leading-none"
                    imgClassName="w-4 h-4 rounded-sm object-contain"
                  />
                </button>
              )}
            />
          </span>
        )}

        {editingId === cat.id ? (
          <input
            autoFocus
            value={editingName}
            onChange={(e) => onChangeEditingName(e.target.value)}
            onBlur={() => void onCommitEdit()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void onCommitEdit()
              if (e.key === 'Escape') onCancelEdit()
            }}
            onClick={stop}
            onPointerDown={stop}
            className="flex-1 min-w-0 bg-transparent outline-none text-sm"
          />
        ) : (
          <span
            className="flex-1 min-w-0 text-sm truncate"
            title={cat.name}
            onDoubleClick={(e) => {
              if (selectMode) return
              e.stopPropagation()
              onStartEdit(cat.id, cat.name)
            }}
          >
            {cat.name}
          </span>
        )}

        <span
          className={cn(
            'text-xs shrink-0 tabular-nums',
            !selectMode && active ? 'text-white/70' : 'text-slate-400',
          )}
        >
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
              onClick={(e) => {
                e.stopPropagation()
                onAddSub(cat)
              }}
              onPointerDown={stop}
              title={`在「${cat.name}」下新建子分类`}
            >
              +
            </button>
            {/* 删除（hover 显示，避免误触） */}
            <button
              className={cn(
                'opacity-0 group-hover:opacity-100 transition-opacity text-xs px-0.5 shrink-0',
                active ? 'text-white/80' : 'text-slate-400 hover:text-red-500',
              )}
              onClick={(e) => {
                e.stopPropagation()
                const msg = hasChildren
                  ? `删除「${cat.name}」及其所有子文件夹和书签？`
                  : `删除「${cat.name}」及其下所有书签？`
                if (window.confirm(msg)) onRemove(cat.id)
              }}
              onPointerDown={stop}
              title="删除"
            >
              ✕
            </button>
          </>
        )}
      </div>

      {/* 子节点：选择模式下不展开，避免操作语义混乱 */}
      {hasChildren && isExpanded && !selectMode && (
        <div>{renderChildren()}</div>
      )}
    </div>
  )
}

function collectDescendantIds(
  ids: string[],
  allCats: Category[],
): Set<string> {
  const result = new Set(ids)
  const queue = [...ids]
  while (queue.length > 0) {
    const pid = queue.shift()!
    for (const c of allCats) {
      if (c.parentId === pid && !result.has(c.id)) {
        result.add(c.id)
        queue.push(c.id)
      }
    }
  }
  return result
}
