import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { BookmarkCard } from '../types/bookmark'
import { getFaviconUrl, getHostname } from '../utils/favicon'
import { useBookmarkStore } from '../stores/useBookmarkStore'
import { cn } from '../utils/cn'

interface Props {
  card: BookmarkCard
}

export function BookmarkCardItem({ card }: Props) {
  const removeCard = useBookmarkStore((s) => s.removeCard)
  const updateCard = useBookmarkStore((s) => s.updateCard)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        'card group p-3 cursor-grab active:cursor-grabbing select-none',
        'flex flex-col gap-2 h-28'
      )}
    >
      <div className="flex items-start gap-2">
        <img
          src={card.icon || getFaviconUrl(card.url)}
          alt=""
          className="w-8 h-8 rounded shrink-0 bg-slate-100 dark:bg-slate-700"
          onError={(e) => {
            ;(e.currentTarget as HTMLImageElement).style.visibility = 'hidden'
          }}
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate" title={card.title}>
            {card.title}
          </div>
          <div className="text-xs text-slate-400 truncate">
            {getHostname(card.url)}
          </div>
        </div>
        <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            className="text-[10px] text-slate-400 hover:text-brand px-1"
            onClick={(e) => {
              e.stopPropagation()
              const newTitle = window.prompt('新标题', card.title)
              if (newTitle?.trim()) updateCard(card.id, { title: newTitle.trim() })
            }}
            onPointerDown={(e) => e.stopPropagation()}
            title="编辑"
          >
            ✎
          </button>
          <button
            className="text-[10px] text-slate-400 hover:text-red-500 px-1"
            onClick={(e) => {
              e.stopPropagation()
              if (window.confirm(`删除「${card.title}」？`)) removeCard(card.id)
            }}
            onPointerDown={(e) => e.stopPropagation()}
            title="删除"
          >
            ✕
          </button>
        </div>
      </div>

      <a
        href={card.url}
        className="mt-auto text-xs text-brand-600 hover:text-brand-700 truncate"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        title={card.url}
      >
        打开 →
      </a>
    </div>
  )
}
