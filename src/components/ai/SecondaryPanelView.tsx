import { useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useAIPanelStore } from '../../ai/panel/usePanelStore'
import { useSecondaryPanelsStore } from '../../ai/panel/useSecondaryPanelsStore'
import { useDraggable } from '../../ai/panel/useDraggable'
import { useResizable } from '../../ai/panel/useResizable'
import {
  PANEL_DEFAULT_SIZE,
  type AITabType,
  type PanelPosition,
  type PanelSize,
  type SecondaryPanel,
} from '../../ai/types'
import { cn } from '../../utils/cn'
import { ChatTab } from './tabs/ChatTab'
import { OrganizeTab } from './tabs/OrganizeTab'
import { LabelsTab } from './tabs/LabelsTab'
import { SettingsTab } from './tabs/SettingsTab'

const TAB_ICON: Record<AITabType, string> = {
  chat: '💬',
  organize: '🗂',
  labels: '🏷',
  settings: '⚙',
}

/**
 * 副浮窗（V3.0 §7.3）—— 一个浮窗一个 tab
 *
 * 与主浮窗相比的简化：
 * - 没有 tab bar / 「+ 新建 tab」（一窗一 tab）
 * - 没有最大化（多个副浮窗都最大化会互相遮挡，意义不大）
 * - 关闭按钮只关闭"分离视图"，主 store 中的 tab 数据保留
 *
 * 与主浮窗共用的：
 * - useDraggable / useResizable hooks
 * - tab 内容组件（ChatTab/OrganizeTab/LabelsTab/SettingsTab）—— 复用主 store
 *   的 tab.state 数据，做到"主副浮窗看的是同一份数据"
 */
export function SecondaryPanelView({ panel }: { panel: SecondaryPanel }) {
  const tab = useAIPanelStore((s) => s.tabs.find((t) => t.id === panel.tabId))
  const setPosition = useSecondaryPanelsStore((s) => s.setPosition)
  const setSize = useSecondaryPanelsStore((s) => s.setSize)
  const focusPanel = useSecondaryPanelsStore((s) => s.focusPanel)
  const toggleMinimize = useSecondaryPanelsStore((s) => s.toggleMinimize)
  const closePanel = useSecondaryPanelsStore((s) => s.closePanel)

  // 默认初始位置：基于 panel.id hash 在视口里散布开，避免新分离的浮窗叠在一起
  const fallbackPos = useMemo<PanelPosition>(() => {
    if (typeof window === 'undefined') return { x: 200, y: 100 }
    // hash 取 0..1 的伪随机
    let h = 0
    for (let i = 0; i < panel.id.length; i++) {
      h = (h * 31 + panel.id.charCodeAt(i)) >>> 0
    }
    const r = (h % 1000) / 1000
    return {
      x: Math.max(40, Math.floor(window.innerWidth * 0.15 + r * 200)),
      y: Math.max(40, Math.floor(window.innerHeight * 0.15 + r * 100)),
    }
  }, [panel.id])
  const effectivePos = panel.position ?? fallbackPos
  const effectiveSize: PanelSize = panel.size ?? PANEL_DEFAULT_SIZE

  const { onPointerDown: onDragPointerDown } = useDraggable({
    position: effectivePos,
    size: effectiveSize,
    onChange: (p) => setPosition(panel.id, p),
    onDragStart: () => focusPanel(panel.id),
    disabled: panel.minimized,
  })
  const { onPointerDown: onResizePointerDown } = useResizable({
    size: effectiveSize,
    onChange: (s) => setSize(panel.id, s),
    disabled: panel.minimized,
  })

  if (typeof document === 'undefined') return null

  // tab 已被主 store 删了 → 副浮窗也无意义了，渲染为空
  // （SecondaryPanelsHost 也会有 useEffect 同步清理，这里是双保险）
  if (!tab) return null

  // ─── 最小化态：在原 position 显示一个小 chip ───
  if (panel.minimized) {
    return createPortal(
      <button
        type="button"
        onClick={() => {
          toggleMinimize(panel.id)
          focusPanel(panel.id)
        }}
        title="点击恢复"
        style={{
          position: 'fixed',
          left: effectivePos.x,
          top: effectivePos.y,
          zIndex: 10100 + panel.zIndex,
        }}
        className={cn(
          'inline-flex items-center gap-1.5 h-7 pl-2 pr-1 rounded-full',
          'bg-white dark:bg-slate-800',
          'border border-slate-200 dark:border-slate-700',
          'shadow-md text-xs text-slate-700 dark:text-slate-200',
          'hover:border-brand/50 transition-colors',
          'group',
        )}
      >
        <span className="text-sm leading-none" aria-hidden>
          {TAB_ICON[tab.type]}
        </span>
        <span className="font-medium leading-none truncate max-w-[140px]">
          {tab.title}
        </span>
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation()
            closePanel(panel.id)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              e.stopPropagation()
              closePanel(panel.id)
            }
          }}
          className={cn(
            'inline-flex items-center justify-center w-4 h-4 rounded-full',
            'text-slate-400 hover:text-red-500',
            'hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors',
          )}
          title="关闭副浮窗（tab 数据保留在主浮窗内）"
          aria-label="关闭副浮窗"
        >
          ✕
        </span>
      </button>,
      document.body,
    )
  }

  // ─── 正常态 ───
  return createPortal(
    <div
      onPointerDownCapture={() => focusPanel(panel.id)}
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        transform: `translate3d(${effectivePos.x}px, ${effectivePos.y}px, 0)`,
        width: effectiveSize.width,
        height: effectiveSize.height,
        zIndex: 10100 + panel.zIndex,
        willChange: 'transform',
      }}
      className={cn(
        'flex flex-col rounded-lg overflow-hidden',
        'bg-white dark:bg-slate-900',
        'border border-fuchsia-200 dark:border-fuchsia-500/30',
        'shadow-2xl',
      )}
      role="dialog"
      aria-label={`AI 副浮窗 - ${tab.title}`}
    >
      {/* Header：拖动区 + tab 标题 + 控制按钮 */}
      <div
        onPointerDown={onDragPointerDown}
        className={cn(
          'flex items-center gap-2 px-3 h-8 shrink-0',
          'border-b border-slate-200 dark:border-slate-700',
          'bg-fuchsia-50/60 dark:bg-fuchsia-500/10',
          'cursor-grab active:cursor-grabbing select-none',
        )}
        title="拖动移动"
      >
        <span className="text-slate-400 text-xs leading-none" aria-hidden>
          ⠿
        </span>
        <span className="text-sm leading-none" aria-hidden>
          {TAB_ICON[tab.type]}
        </span>
        <span
          className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate"
          title={tab.title}
        >
          {tab.title}
        </span>
        <span
          className={cn(
            'shrink-0 inline-flex items-center px-1 h-3.5 rounded text-[9px] font-medium leading-none',
            'bg-fuchsia-100 dark:bg-fuchsia-500/20 text-fuchsia-700 dark:text-fuchsia-300',
          )}
          title="这是从主浮窗分离出来的副浮窗"
        >
          副
        </span>
        <div className="flex-1" />

        <div className="flex items-center gap-0.5" data-no-drag>
          <HeaderBtn
            onClick={() => toggleMinimize(panel.id)}
            title="最小化"
            aria-label="最小化"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
              <line x1="2" y1="5" x2="8" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </HeaderBtn>
          <HeaderBtn
            onClick={() => closePanel(panel.id)}
            title="关闭副浮窗（tab 数据保留在主浮窗内）"
            aria-label="关闭副浮窗"
            danger
          >
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
              <line x1="2.5" y1="2.5" x2="7.5" y2="7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="7.5" y1="2.5" x2="2.5" y2="7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </HeaderBtn>
        </div>
      </div>

      {/* 内容区：根据 tab.type 路由到对应组件，复用主 store 数据 */}
      <div
        data-no-drag
        className="flex-1 min-h-0 overflow-auto bg-white dark:bg-slate-900"
      >
        <SecondaryTabContent type={tab.type} tabId={tab.id} />
      </div>

      {/* 角落 resize 手柄 */}
      <div
        onPointerDown={onResizePointerDown('se')}
        className="absolute bottom-0 right-0 w-3 h-3 cursor-nwse-resize"
        style={{ touchAction: 'none' }}
        aria-hidden
      />
      <div
        onPointerDown={onResizePointerDown('e')}
        className="absolute top-0 right-0 w-1.5 h-full cursor-ew-resize"
        style={{ touchAction: 'none' }}
        aria-hidden
      />
      <div
        onPointerDown={onResizePointerDown('s')}
        className="absolute bottom-0 left-0 w-full h-1.5 cursor-ns-resize"
        style={{ touchAction: 'none' }}
        aria-hidden
      />
    </div>,
    document.body,
  )
}

function HeaderBtn({
  onClick,
  title,
  ariaLabel,
  children,
  danger,
}: {
  onClick: () => void
  title: string
  'aria-label'?: string
  ariaLabel?: string
  children: React.ReactNode
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      onPointerDown={(e) => e.stopPropagation()}
      title={title}
      aria-label={ariaLabel ?? title}
      className={cn(
        'w-5 h-5 inline-flex items-center justify-center rounded',
        'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200',
        'hover:bg-slate-200/70 dark:hover:bg-slate-700/60 transition-colors',
        danger &&
          'hover:!text-red-500 hover:!bg-red-50 dark:hover:!bg-red-500/10',
      )}
    >
      {children}
    </button>
  )
}

/** 与 AIPanel.TabContent 同款路由（复用主 store 数据） */
function SecondaryTabContent({
  type,
  tabId,
}: {
  type: AITabType
  tabId: string
}) {
  switch (type) {
    case 'chat':
      return <ChatTab tabId={tabId} />
    case 'organize':
      return <OrganizeTab />
    case 'labels':
      return <LabelsTab />
    case 'settings':
      return <SettingsTab />
  }
}
