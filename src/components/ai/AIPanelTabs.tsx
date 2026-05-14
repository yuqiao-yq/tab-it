import { cn } from '../../utils/cn'
import { useAIPanelStore } from '../../ai/panel/usePanelStore'
import type { AITabType } from '../../ai/types'
import { CardMenu } from '../CardMenu'

const TAB_ICON: Record<AITabType, string> = {
  chat: '💬',
  organize: '🗂',
  labels: '🏷',
  settings: '⚙',
}

/**
 * 浮窗内的 Tab 切换条。
 * - 横向滚动避免 tab 多了挤爆
 * - 「+」按钮：弹出菜单选择新 tab 类型
 * - 单个 tab：点击切换；右侧 × 关闭
 * - 持久化：tabs 数组在 store 中已被持久化，刷新后恢复
 */
export function AIPanelTabs() {
  const tabs = useAIPanelStore((s) => s.tabs)
  const activeTabId = useAIPanelStore((s) => s.activeTabId)
  const setActiveTab = useAIPanelStore((s) => s.setActiveTab)
  const closeTab = useAIPanelStore((s) => s.closeTab)
  const addTab = useAIPanelStore((s) => s.addTab)

  return (
    <div
      data-no-drag
      className={cn(
        'flex items-center gap-0.5 px-1.5 h-8 shrink-0',
        'border-b border-slate-200 dark:border-slate-700',
        'bg-white dark:bg-slate-900',
        'overflow-x-auto scrollbar-thin',
      )}
    >
      {tabs.map((t) => {
        const active = t.id === activeTabId
        return (
          <div
            key={t.id}
            className={cn(
              'group flex items-center gap-1 h-6 px-2 rounded text-xs',
              'cursor-pointer shrink-0 max-w-[140px]',
              'transition-colors',
              active
                ? 'bg-brand/10 text-brand font-medium'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800',
            )}
            onClick={() => setActiveTab(t.id)}
          >
            <span aria-hidden className="text-sm leading-none">
              {TAB_ICON[t.type]}
            </span>
            <span className="truncate">{t.title}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                closeTab(t.id)
              }}
              className={cn(
                'w-4 h-4 inline-flex items-center justify-center rounded text-[10px] shrink-0',
                'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity',
                'text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10',
              )}
              title="关闭此标签"
              aria-label="关闭此标签"
            >
              ✕
            </button>
          </div>
        )
      })}

      {/* 新建 tab 菜单 */}
      <CardMenu
        ariaLabel="新建标签"
        align="left"
        menuWidth={140}
        menuZIndex={10200}
        items={(['chat', 'organize', 'labels', 'settings'] as AITabType[]).map(
          (type) => ({
            key: type,
            label: TAB_LABELS[type],
            icon: <span className="text-sm leading-none">{TAB_ICON[type]}</span>,
            onSelect: () => addTab(type),
          }),
        )}
        trigger={(toggle) => (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              toggle()
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className={cn(
              'w-6 h-6 inline-flex items-center justify-center rounded shrink-0',
              'text-slate-400 hover:text-brand',
              'hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors',
              'text-base leading-none',
            )}
            title="新建标签"
            aria-label="新建标签"
          >
            +
          </button>
        )}
      />
    </div>
  )
}

const TAB_LABELS: Record<AITabType, string> = {
  chat: '💬 新对话',
  organize: '🗂 整理书签',
  labels: '🏷 自动标签',
  settings: '⚙ AI 设置',
}
