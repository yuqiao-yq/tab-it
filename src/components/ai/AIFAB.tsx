import { createPortal } from 'react-dom'
import { useAIPanelStore } from '../../ai/panel/usePanelStore'
import { FAB_OFFSET, FAB_SIZE } from '../../ai/types'
import { cn } from '../../utils/cn'

interface Props {
  /**
   * 是否已配置 AI（决定 FAB 是否亮起）。
   * V1.0 浮窗壳子阶段还没有 AI 设置，先固定为 false（灰色）。
   * 等 4.1 任务接通 AI Settings store 后，传入真实的「至少有一个可用 Provider」判断。
   */
  configured?: boolean
  /**
   * 是否处于 AI 思考中（呼吸光晕）。
   * V1.0 阶段固定 false；具体 AI 任务执行时由 service 层置位。
   */
  thinking?: boolean
  /**
   * 是否有未读的被动建议（V1.5 任务 5.2）。
   */
  hasNew?: boolean
}

/**
 * 右下角 ✨ 悬浮按钮（FAB）。
 *
 * 4 种状态：
 * - 未配置：灰色 + 点击 → 浮窗自动落到「⚙ 设置」tab，引导配置
 * - 已配置：brand 色 + 点击 → 打开浮窗（恢复上次状态）
 * - 思考中：呼吸光晕动画
 * - 有新建议：右上小红点
 *
 * 浮窗展开 / 最小化时，FAB 隐藏（避免双入口）。
 */
export function AIFAB({ configured = false, thinking = false, hasNew = false }: Props) {
  const visible = useAIPanelStore((s) => s.visible)
  const open = useAIPanelStore((s) => s.open)

  // 浮窗已打开（包括最小化）时不显示 FAB
  if (visible) return null
  if (typeof document === 'undefined') return null

  return createPortal(
    <button
      type="button"
      onClick={() => {
        // 未配置 → 引导到 settings tab；已配置 → 默认行为
        if (!configured) open('settings')
        else open()
      }}
      title={configured ? 'AI 助手 (Cmd/Ctrl+J)' : '点击配置 AI 助手'}
      aria-label="AI 助手"
      style={{
        width: FAB_SIZE,
        height: FAB_SIZE,
        right: FAB_OFFSET.right,
        bottom: FAB_OFFSET.bottom,
      }}
      className={cn(
        'fixed z-[10080] inline-flex items-center justify-center rounded-full',
        'transition-all duration-200',
        'shadow-lg',
        configured
          ? 'bg-brand text-white hover:bg-brand-600 hover:scale-105'
          : cn(
              'bg-slate-200 text-slate-500',
              'dark:bg-slate-700 dark:text-slate-400',
              'hover:bg-slate-300 dark:hover:bg-slate-600',
            ),
        thinking && 'animate-pulse',
      )}
    >
      {/* ✨ 主图标 */}
      <span className="text-2xl leading-none" aria-hidden>
        ✨
      </span>

      {/* 红点：有未读被动建议 */}
      {hasNew && (
        <span
          className={cn(
            'absolute top-1 right-1 w-2.5 h-2.5 rounded-full',
            'bg-red-500 border-2 border-white dark:border-slate-900',
          )}
          aria-hidden
        />
      )}

      {/* 思考中的光晕（叠加一层放大渐隐的圆，营造"呼吸"感） */}
      {thinking && (
        <span
          className={cn(
            'absolute inset-0 rounded-full pointer-events-none',
            'bg-brand/30 animate-ping',
          )}
          aria-hidden
        />
      )}
    </button>,
    document.body,
  )
}
