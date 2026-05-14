import { useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useAIPanelStore } from '../../ai/panel/usePanelStore'
import { useDraggable } from '../../ai/panel/useDraggable'
import { useResizable } from '../../ai/panel/useResizable'
import {
  PANEL_DEFAULT_SIZE,
  defaultPanelPosition,
  type AITabType,
  type PanelPosition,
  type PanelSize,
} from '../../ai/types'
import { cn } from '../../utils/cn'
import { AIPanelHeader } from './AIPanelHeader'
import { AIPanelTabs } from './AIPanelTabs'
import { AIPanelMinimized } from './AIPanelMinimized'
import { ChatTab } from './tabs/ChatTab'
import { OrganizeTab } from './tabs/OrganizeTab'
import { LabelsTab } from './tabs/LabelsTab'
import { SettingsTab } from './tabs/SettingsTab'

/**
 * AI 浮窗主容器。
 *
 * 三种渲染态：
 * 1. 不可见（visible=false）            → 返回 null
 * 2. 最小化（visible=true, minimized）  → 渲染 AIPanelMinimized
 * 3. 展开 / 最大化                     → 渲染完整浮窗
 *
 * 通过 React Portal 挂到 document.body，避免被祖先 overflow / transform
 * 创建的 stacking context 困住。
 */
export function AIPanel() {
  const visible = useAIPanelStore((s) => s.visible)
  const minimized = useAIPanelStore((s) => s.minimized)
  const maximized = useAIPanelStore((s) => s.maximized)
  const position = useAIPanelStore((s) => s.position)
  const size = useAIPanelStore((s) => s.size)
  const tabs = useAIPanelStore((s) => s.tabs)
  const activeTabId = useAIPanelStore((s) => s.activeTabId)
  const setPosition = useAIPanelStore((s) => s.setPosition)
  const setSize = useAIPanelStore((s) => s.setSize)
  const toggleMaximize = useAIPanelStore((s) => s.toggleMaximize)

  // 视口默认值（仅在 SSR 兜底用，client 侧 init 时已 clamp 过）
  const fallbackPos = useMemo<PanelPosition>(
    () =>
      typeof window !== 'undefined'
        ? defaultPanelPosition({
            width: window.innerWidth,
            height: window.innerHeight,
          })
        : { x: 200, y: 100 },
    [],
  )
  const effectivePos = position ?? fallbackPos
  const effectiveSize: PanelSize = size ?? PANEL_DEFAULT_SIZE

  // 拖动 + 缩放 hooks（仅在非最大化时启用）
  const { onPointerDown: onDragPointerDown } = useDraggable({
    position: effectivePos,
    size: effectiveSize,
    onChange: setPosition,
    disabled: maximized,
  })
  const { onPointerDown: onResizePointerDown } = useResizable({
    size: effectiveSize,
    onChange: setSize,
    disabled: maximized,
  })

  // ESC 不关闭浮窗（与 modal 区分）；点击外部也不关闭，确保"持续存在"
  useEffect(() => {
    // 这里不做任何 outside-click / escape 处理，是有意为之
  }, [])

  if (typeof document === 'undefined') return null
  if (!visible) return null

  // 最小化态
  if (minimized) {
    return createPortal(<AIPanelMinimized />, document.body)
  }

  const activeTab = tabs.find((t) => t.id === activeTabId)

  // 最大化时居中 + 半透明遮罩
  const maxStyle: React.CSSProperties = maximized
    ? {
        position: 'fixed',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        width: 'min(70vw, 1200px)',
        height: '80vh',
      }
    : {
        position: 'fixed',
        left: 0,
        top: 0,
        transform: `translate3d(${effectivePos.x}px, ${effectivePos.y}px, 0)`,
        width: effectiveSize.width,
        height: effectiveSize.height,
      }

  const panelEl = (
    <>
      {/* 最大化时的半透明背景遮罩；点击遮罩 → 退出最大化 */}
      {maximized && (
        <div
          className="fixed inset-0 z-[10090] bg-black/30"
          onClick={() => toggleMaximize()}
          aria-hidden
        />
      )}
      <div
        style={{ ...maxStyle, willChange: 'transform' }}
        className={cn(
          'z-[10100] flex flex-col',
          'rounded-lg overflow-hidden',
          'bg-white dark:bg-slate-900',
          'border border-slate-200 dark:border-slate-700',
          'shadow-2xl',
          // 让浮窗内的 input 等控件聚焦时不会有外层 scroll
        )}
        role="dialog"
        aria-label="AI 助手"
      >
        <AIPanelHeader onDragPointerDown={onDragPointerDown} />
        <AIPanelTabs />

        {/* 内容区（每个 tab 自己实现） */}
        <div
          data-no-drag
          className="flex-1 min-h-0 overflow-auto bg-white dark:bg-slate-900"
        >
          {activeTab ? (
            <TabContent type={activeTab.type} tabId={activeTab.id} />
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-slate-400">
              点击上方 + 新建一个标签
            </div>
          )}
        </div>

        {/* Footer：占位（V1 阶段先简单显示，后续放成本统计 / Provider 状态） */}
        <div
          data-no-drag
          className={cn(
            'flex items-center gap-2 px-3 h-7 shrink-0',
            'border-t border-slate-200 dark:border-slate-700',
            'bg-slate-50/60 dark:bg-slate-800/40',
            'text-[11px] text-slate-400',
          )}
        >
          <span>未配置 AI · 在「⚙ 设置」中添加 Provider</span>
          <div className="flex-1" />
          {/* Resize 手柄触发区：右下角 */}
          {!maximized && (
            <span
              onPointerDown={onResizePointerDown('se')}
              className="cursor-nwse-resize text-slate-400 hover:text-brand select-none"
              title="拖动调整尺寸"
              aria-label="调整尺寸"
            >
              ⌟
            </span>
          )}
        </div>

        {/* 边缘 resize 手柄（隐形热区）：仅非最大化态可用 */}
        {!maximized && (
          <>
            {/* 右边缘 */}
            <div
              onPointerDown={onResizePointerDown('e')}
              className="absolute top-0 right-0 w-1.5 h-full cursor-ew-resize"
              style={{ touchAction: 'none' }}
              aria-hidden
            />
            {/* 下边缘 */}
            <div
              onPointerDown={onResizePointerDown('s')}
              className="absolute bottom-0 left-0 w-full h-1.5 cursor-ns-resize"
              style={{ touchAction: 'none' }}
              aria-hidden
            />
          </>
        )}
      </div>
    </>
  )

  return createPortal(panelEl, document.body)
}

// ─── Tab 内容路由 ─────────────────────────────────────

function TabContent({ type }: { type: AITabType; tabId: string }) {
  switch (type) {
    case 'chat':
      return <ChatTab />
    case 'organize':
      return <OrganizeTab />
    case 'labels':
      return <LabelsTab />
    case 'settings':
      return <SettingsTab />
  }
}

