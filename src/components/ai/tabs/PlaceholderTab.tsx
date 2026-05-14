import { cn } from '../../../utils/cn'

/**
 * Tab 占位通用组件：在 V1.0 浮窗壳子阶段，所有 tab 内容都是占位文案。
 * 后续每个具体 tab 会替换为真实组件。
 */
export function PlaceholderTab({
  emoji,
  title,
  description,
  cta,
}: {
  emoji: string
  title: string
  description: string
  cta?: string
}) {
  return (
    <div
      className={cn(
        'h-full w-full flex flex-col items-center justify-center',
        'px-6 py-8 text-center gap-3',
      )}
    >
      <div className="text-5xl leading-none">{emoji}</div>
      <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200">
        {title}
      </h3>
      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-[260px]">
        {description}
      </p>
      {cta && (
        <div
          className={cn(
            'mt-2 inline-flex items-center gap-1 px-2 py-1 rounded',
            'bg-slate-100 dark:bg-slate-700/60',
            'text-[11px] text-slate-500 dark:text-slate-400',
          )}
        >
          {cta}
        </div>
      )}
    </div>
  )
}
