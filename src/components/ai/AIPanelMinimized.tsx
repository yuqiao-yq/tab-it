import { cn } from '../../utils/cn'
import { useAIPanelStore } from '../../ai/panel/usePanelStore'

/**
 * 浮窗最小化形态：右下角小 chip。
 *
 * - 点击 chip → 恢复浮窗
 * - 点击 ✕ → 关闭浮窗（与 chip 整体点击区分开，需要 stopPropagation）
 * - 显示当前活跃 tab 的标题（让用户知道挂着什么任务）
 *
 * 与 ToastContainer 同样用 fixed 定位在右下，但 z 层略高于 toast，
 * 让用户能持续看到挂着的 AI 任务，避免被新出现的 toast 完全遮挡。
 */
export function AIPanelMinimized() {
  const tabs = useAIPanelStore((s) => s.tabs)
  const activeTabId = useAIPanelStore((s) => s.activeTabId)
  const toggleMinimize = useAIPanelStore((s) => s.toggleMinimize)
  const close = useAIPanelStore((s) => s.close)

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0]
  const label = activeTab ? `${activeTab.title}` : 'AI 助手'

  return (
    <button
      type="button"
      onClick={toggleMinimize}
      title="点击恢复浮窗"
      className={cn(
        'fixed bottom-4 right-4 z-[10100]',
        'inline-flex items-center gap-1.5 h-8 pl-2 pr-1 rounded-full',
        'bg-white dark:bg-slate-800',
        'border border-slate-200 dark:border-slate-700',
        'shadow-lg backdrop-blur',
        'text-xs text-slate-700 dark:text-slate-200',
        'hover:border-brand/50 transition-colors',
        'group',
      )}
    >
      <span className="text-sm leading-none" aria-hidden>
        ✨
      </span>
      <span className="font-medium leading-none">{label}</span>
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation()
          close()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            e.stopPropagation()
            close()
          }
        }}
        className={cn(
          'inline-flex items-center justify-center w-5 h-5 rounded-full',
          'text-slate-400 hover:text-red-500',
          'hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors',
        )}
        title="关闭浮窗"
        aria-label="关闭浮窗"
      >
        ✕
      </span>
    </button>
  )
}
