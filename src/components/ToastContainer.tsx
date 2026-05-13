import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useToastStore, type Toast, type ToastKind } from '../stores/useToastStore'
import { cn } from '../utils/cn'

/**
 * Toast 容器：固定在视窗右上角，竖向堆叠。
 * 通过 React Portal 挂到 document.body，避免被祖先 overflow / z-index 遮挡。
 *
 * 单条 Toast 用 enter/leave 微动画：挂载后下一帧切换 visible=true 触发过渡进入；
 * dismiss 时先把本地 visible=false 让动画跑完，再把 store 中的条目移除。
 */
export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className={cn(
        'fixed top-4 right-4 z-[10000] flex flex-col gap-2',
        'pointer-events-none',
      )}
      role="region"
      aria-label="通知"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>,
    document.body,
  )
}

function ToastItem({
  toast: t,
  onDismiss,
}: {
  toast: Toast
  onDismiss: () => void
}) {
  // 入场动画：mount 后下一帧切到 visible
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const palette = KIND_PALETTE[t.kind]

  return (
    <div
      role="status"
      className={cn(
        'pointer-events-auto min-w-[260px] max-w-[360px]',
        'rounded-md border shadow-lg backdrop-blur',
        'transition-all duration-200 ease-out',
        palette.container,
        visible
          ? 'opacity-100 translate-x-0'
          : 'opacity-0 translate-x-2',
      )}
    >
      <div className="flex items-start gap-2.5 px-3 py-2.5">
        <span
          className={cn(
            'shrink-0 w-5 h-5 rounded-full inline-flex items-center justify-center text-xs font-bold',
            palette.icon,
          )}
          aria-hidden
        >
          {KIND_ICON[t.kind]}
        </span>
        <div className="flex-1 min-w-0">
          <div className={cn('text-sm font-medium leading-snug', palette.title)}>
            {t.title}
          </div>
          {t.message && (
            <div
              className={cn(
                'mt-0.5 text-xs leading-snug whitespace-pre-line break-words',
                palette.message,
              )}
            >
              {t.message}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className={cn(
            'shrink-0 w-5 h-5 inline-flex items-center justify-center rounded',
            'text-xs leading-none',
            palette.close,
          )}
          aria-label="关闭"
          title="关闭"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

const KIND_ICON: Record<ToastKind, string> = {
  success: '✓',
  error: '!',
  info: 'i',
  warning: '!',
}

const KIND_PALETTE: Record<
  ToastKind,
  {
    container: string
    icon: string
    title: string
    message: string
    close: string
  }
> = {
  success: {
    container:
      'bg-white/95 dark:bg-slate-800/95 border-emerald-200 dark:border-emerald-800/60',
    icon: 'bg-emerald-500 text-white',
    title: 'text-emerald-700 dark:text-emerald-300',
    message: 'text-slate-600 dark:text-slate-300',
    close: 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/60',
  },
  error: {
    container:
      'bg-white/95 dark:bg-slate-800/95 border-red-200 dark:border-red-800/60',
    icon: 'bg-red-500 text-white',
    title: 'text-red-600 dark:text-red-300',
    message: 'text-slate-600 dark:text-slate-300',
    close: 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/60',
  },
  warning: {
    container:
      'bg-white/95 dark:bg-slate-800/95 border-amber-200 dark:border-amber-800/60',
    icon: 'bg-amber-500 text-white',
    title: 'text-amber-700 dark:text-amber-300',
    message: 'text-slate-600 dark:text-slate-300',
    close: 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/60',
  },
  info: {
    container:
      'bg-white/95 dark:bg-slate-800/95 border-slate-200 dark:border-slate-700',
    icon: 'bg-slate-500 text-white',
    title: 'text-slate-700 dark:text-slate-200',
    message: 'text-slate-500 dark:text-slate-400',
    close: 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/60',
  },
}
