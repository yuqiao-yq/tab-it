import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
} from '@dnd-kit/sortable'
import { useMemo, useState } from 'react'
import type { BookmarkCard, Category } from '../types/bookmark'
import { useBookmarkStore } from '../stores/useBookmarkStore'
import { BookmarkCardItem } from './BookmarkCardItem'
import { FolderCard } from './FolderCard'
import { RecentSection } from './RecentSection'
import { cn } from '../utils/cn'

const GRID_COLS =
  'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3'

export function BookmarkGrid() {
  const allCards = useBookmarkStore((s) => s.cards)
  const allCategories = useBookmarkStore((s) => s.categories)
  const activeCategoryId = useBookmarkStore((s) => s.activeCategoryId)
  const keyword = useBookmarkStore((s) => s.searchKeyword)

  // 搜索模式：全库搜索书签（不显示文件夹）
  const isSearching = keyword.trim().length > 0

  // 当前层的搜索结果
  const searchResultCards = useMemo(() => {
    if (!isSearching) return []
    const kw = keyword.trim().toLowerCase()
    return allCards
      .filter(
        (c) =>
          c.title.toLowerCase().includes(kw) ||
          c.url.toLowerCase().includes(kw)
      )
      .sort((a, b) => a.order - b.order)
  }, [allCards, keyword, isSearching])

  // 搜索模式：扁平展示
  if (isSearching) {
    return (
      <div className={GRID_COLS}>
        {searchResultCards.map((card) => (
          <BookmarkCardItem key={card.id} card={card} />
        ))}
        {searchResultCards.length === 0 && (
          <div className="col-span-full text-center py-16 text-slate-400">
            没有找到匹配的书签
          </div>
        )}
      </div>
    )
  }

  if (!activeCategoryId) return null

  const activeCategory = allCategories.find((c) => c.id === activeCategoryId)
  if (!activeCategory) return null

  // DFS 收集当前 active 分类下的所有后代分类（按 order 排序），用于按 section 展示
  const descendants = collectDescendantsDFS(activeCategoryId, allCategories)

  // 当前层是否完全为空（无子文件夹、无直接书签、无后代）
  const directCardCount = allCards.filter((c) => c.categoryId === activeCategoryId).length
  const directFolderCount = allCategories.filter((c) => c.parentId === activeCategoryId).length
  const isEmpty =
    directCardCount === 0 && directFolderCount === 0 && descendants.length === 0

  return (
    <div className="flex flex-col gap-8">
      {/* 最近使用：常驻在分类内容上方，独立折叠（搜索模式由上方 if 提前 return，这里不会渲染） */}
      <RecentSection />

      {/* 当前分类（根 section）：使用 compact header 暴露折叠按钮 */}
      <CategorySection
        category={activeCategory}
        showFolders
        headerVariant="compact"
      />

      {/* 所有后代分类（递归 DFS）：每个作为独立 section（full header） */}
      {descendants.map((cat) => (
        <CategorySection
          key={cat.id}
          category={cat}
          showFolders={false}
          headerVariant="full"
        />
      ))}

      {/* 空状态 */}
      {isEmpty && (
        <div className="text-center py-12 text-slate-400">
          <div className="text-4xl mb-3">📭</div>
          <p className="text-sm">这里还没有内容，点击 + 添加书签</p>
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
 * CategorySection：单个分类的内容区块
 * - showFolders：是否显示直接子文件夹卡片（仅根 section 显示，避免重复）
 * - headerVariant：
 *   - 'full'    完整 header（含面包屑路径），用于子 section
 *   - 'compact' 紧凑 header（仅折叠按钮 + 数量 + 添加书签），用于根 section
 *               （路径已由 Breadcrumb 承担，避免重复，但保留折叠能力）
 *   - 'none'    不渲染 header（旧行为，保留以备扩展）
 * ───────────────────────────────────────────────────────────── */
type HeaderVariant = 'full' | 'compact' | 'none'
interface SectionProps {
  category: Category
  showFolders: boolean
  headerVariant: HeaderVariant
}

function CategorySection({
  category,
  showFolders,
  headerVariant,
}: SectionProps) {
  const allCards = useBookmarkStore((s) => s.cards)
  const allCategories = useBookmarkStore((s) => s.categories)
  const setActive = useBookmarkStore((s) => s.setActiveCategory)
  const reorder = useBookmarkStore((s) => s.reorderCardsInCategory)
  const addCard = useBookmarkStore((s) => s.addCard)

  // header 渲染辅助：full 显示完整路径头，compact 仅显示折叠按钮（用于根 section）
  const showFullHeader = headerVariant === 'full'
  const showCompactHeader = headerVariant === 'compact'

  // section 自身的折叠状态（compact / full 两种 header 都能切换）
  const [collapsed, setCollapsed] = useState(false)

  const subFolders = useMemo(
    () =>
      showFolders
        ? allCategories
            .filter((c) => c.parentId === category.id)
            .sort((a, b) => a.order - b.order)
        : [],
    [allCategories, category.id, showFolders],
  )

  const directCards = useMemo(
    () =>
      allCards
        .filter((c) => c.categoryId === category.id)
        .sort((a, b) => a.order - b.order),
    [allCards, category.id],
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const handleDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const ids = directCards.map((c) => c.id)
    const oldIdx = ids.indexOf(active.id as string)
    const newIdx = ids.indexOf(over.id as string)
    if (oldIdx === -1 || newIdx === -1) return
    await reorder(category.id, arrayMove(ids, oldIdx, newIdx))
  }

  const handleAddCard = async () => {
    const url = window.prompt('请输入网址（URL）')
    if (!url?.trim()) return
    const title = window.prompt('请输入标题', url) || url
    await addCard({ categoryId: category.id, title: title.trim(), url: url.trim() })
  }

  // 计算相对 active 根的路径，用于 section 标题（如 "工作 / 项目A / 文档"）
  const breadcrumbPath = useMemo(() => {
    if (!showFullHeader) return ''
    const map = new Map(allCategories.map((c) => [c.id, c]))
    const parts: string[] = []
    let cur: Category | undefined = category
    while (cur) {
      parts.unshift(cur.name)
      cur = cur.parentId ? map.get(cur.parentId) : undefined
    }
    return parts.join(' / ')
  }, [allCategories, category, showFullHeader])

  // section 整体为空时（无子文件夹、无书签）也显示出来——保持目录结构可见
  const sectionIsEmpty = subFolders.length === 0 && directCards.length === 0

  return (
    <section>
      {showFullHeader && (
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
          <span className="text-base leading-none">{category.icon ?? '📂'}</span>
          <button
            onClick={() => setActive(category.id)}
            className="text-sm font-medium text-slate-700 dark:text-slate-200 hover:text-brand transition-colors truncate"
            title={`进入：${breadcrumbPath}`}
          >
            {breadcrumbPath}
          </button>
          <span className="text-xs text-slate-400 tabular-nums">
            {directCards.length > 0 && `${directCards.length} 个书签`}
          </span>
          <div className="flex-1 border-t border-dashed border-slate-200 dark:border-slate-700 ml-2" />
          <button
            onClick={handleAddCard}
            className="opacity-0 group-hover/sec:opacity-100 transition-opacity btn-ghost !p-1 h-6 w-6 text-sm"
            title="在此分类添加书签"
          >+</button>
        </header>
      )}

      {/* compact header：根 section 专用——仅折叠按钮 + 「当前分类」标签 + 数量
          路径已由 Breadcrumb 承担，避免重复；保留折叠能力即可 */}
      {showCompactHeader && (
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
          <span className="text-xs uppercase tracking-wider text-slate-400">
            当前分类
          </span>
          <span className="text-xs text-slate-400 tabular-nums">
            {subFolders.length > 0 && `${subFolders.length} 文件夹`}
            {subFolders.length > 0 && directCards.length > 0 && ' · '}
            {directCards.length > 0 && `${directCards.length} 书签`}
          </span>
          <div className="flex-1 border-t border-dashed border-slate-200 dark:border-slate-700 ml-2" />
        </header>
      )}

      {!collapsed && (
        <>
          {/* 直接子文件夹（仅根 section 显示） */}
          {subFolders.length > 0 && (
            <div className="mb-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                文件夹
              </h3>
              <div className={GRID_COLS}>
                {subFolders.map((cat) => (
                  <FolderCard key={cat.id} category={cat} />
                ))}
              </div>
            </div>
          )}

          {/* 直接书签（支持拖拽排序）：根 section（非 full header）始终显示，方便随时 +；
              子 section（full header）只有有书签时显示，避免视觉空洞 */}
          {(directCards.length > 0 || !showFullHeader) && (
            <div>
              {showFolders && subFolders.length > 0 && (
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                  书签
                </h3>
              )}
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={directCards.map((c) => c.id)}
                  strategy={rectSortingStrategy}
                >
                  <div className={GRID_COLS}>
                    {directCards.map((card) => (
                      <BookmarkCardItem key={card.id} card={card} />
                    ))}
                    {/* 仅在根 section（非 full header）显示 + 按钮，子 section 由 header 上的 + 处理 */}
                    {!showFullHeader && (
                      <button
                        onClick={handleAddCard}
                        className="card flex items-center justify-center h-24 text-3xl text-slate-300 hover:text-brand hover:border-brand/50 transition-colors"
                        title="新建书签"
                      >
                        +
                      </button>
                    )}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          )}

          {/* 子 section 完全为空时给一个柔和提示，保持目录结构可见 */}
          {showFullHeader && sectionIsEmpty && (
            <div className="text-xs text-slate-400 pl-7 pb-1">空文件夹</div>
          )}
        </>
      )}
    </section>
  )
}

/** DFS 收集所有后代分类（不含自己），按 order 顺序遍历 */
function collectDescendantsDFS(rootId: string, allCats: Category[]): Category[] {
  const result: Category[] = []
  const dfs = (parentId: string) => {
    const children = allCats
      .filter((c) => c.parentId === parentId)
      .sort((a, b) => a.order - b.order)
    for (const child of children) {
      result.push(child)
      dfs(child.id)
    }
  }
  dfs(rootId)
  return result
}
