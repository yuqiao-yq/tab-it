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
import { useMemo } from 'react'
import { useBookmarkStore } from '../stores/useBookmarkStore'
import { BookmarkCardItem } from './BookmarkCardItem'
import { FolderCard } from './FolderCard'

const GRID_COLS =
  'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3'

export function BookmarkGrid() {
  const allCards = useBookmarkStore((s) => s.cards)
  const allCategories = useBookmarkStore((s) => s.categories)
  const activeCategoryId = useBookmarkStore((s) => s.activeCategoryId)
  const keyword = useBookmarkStore((s) => s.searchKeyword)
  const reorder = useBookmarkStore((s) => s.reorderCardsInCategory)
  const addCard = useBookmarkStore((s) => s.addCard)

  // 搜索模式：全库搜索书签（不显示文件夹）
  const isSearching = keyword.trim().length > 0

  // 当前层的子文件夹（非搜索模式）
  const subFolders = useMemo(() => {
    if (isSearching || !activeCategoryId) return []
    return allCategories
      .filter((c) => c.parentId === activeCategoryId)
      .sort((a, b) => a.order - b.order)
  }, [allCategories, activeCategoryId, isSearching])

  // 当前层的书签卡片（搜索模式下全库过滤）
  const filteredCards = useMemo(() => {
    if (isSearching) {
      const kw = keyword.trim().toLowerCase()
      return allCards
        .filter(
          (c) =>
            c.title.toLowerCase().includes(kw) ||
            c.url.toLowerCase().includes(kw)
        )
        .sort((a, b) => a.order - b.order)
    }
    if (!activeCategoryId) return []
    return allCards
      .filter((c) => c.categoryId === activeCategoryId)
      .sort((a, b) => a.order - b.order)
  }, [allCards, activeCategoryId, keyword, isSearching])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const handleDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id || !activeCategoryId || isSearching) return
    const ids = filteredCards.map((c) => c.id)
    const oldIdx = ids.indexOf(active.id as string)
    const newIdx = ids.indexOf(over.id as string)
    if (oldIdx === -1 || newIdx === -1) return
    await reorder(activeCategoryId, arrayMove(ids, oldIdx, newIdx))
  }

  const handleAddCard = async () => {
    if (!activeCategoryId) return
    const url = window.prompt('请输入网址（URL）')
    if (!url?.trim()) return
    const title = window.prompt('请输入标题', url) || url
    await addCard({ categoryId: activeCategoryId, title: title.trim(), url: url.trim() })
  }

  const isEmpty = subFolders.length === 0 && filteredCards.length === 0

  // 搜索时简单展示，不需要拖拽
  if (isSearching) {
    return (
      <div className={GRID_COLS}>
        {filteredCards.map((card) => (
          <BookmarkCardItem key={card.id} card={card} />
        ))}
        {filteredCards.length === 0 && (
          <div className="col-span-full text-center py-16 text-slate-400">
            没有找到匹配的书签
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* 子文件夹区 */}
      {subFolders.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
            文件夹
          </h3>
          <div className={GRID_COLS}>
            {subFolders.map((cat) => (
              <FolderCard key={cat.id} category={cat} />
            ))}
          </div>
        </section>
      )}

      {/* 书签卡片区（支持拖拽排序） */}
      <section>
        {subFolders.length > 0 && (
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
            items={filteredCards.map((c) => c.id)}
            strategy={rectSortingStrategy}
          >
            <div className={GRID_COLS}>
              {filteredCards.map((card) => (
                <BookmarkCardItem key={card.id} card={card} />
              ))}
              {activeCategoryId && (
                <button
                  onClick={handleAddCard}
                  className="card flex items-center justify-center h-28 text-3xl text-slate-300 hover:text-brand hover:border-brand/50 transition-colors"
                  title="新建书签"
                >
                  +
                </button>
              )}
            </div>
          </SortableContext>
        </DndContext>
      </section>

      {/* 空状态 */}
      {isEmpty && activeCategoryId && (
        <div className="text-center py-12 text-slate-400">
          <div className="text-4xl mb-3">📭</div>
          <p className="text-sm">这里还没有内容，点击 + 添加书签</p>
        </div>
      )}
    </div>
  )
}
