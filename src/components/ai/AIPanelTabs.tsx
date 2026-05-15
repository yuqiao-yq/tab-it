import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../utils/cn'
import { useAIPanelStore } from '../../ai/panel/usePanelStore'
import { useSecondaryPanelsStore } from '../../ai/panel/useSecondaryPanelsStore'
import type { AITabType } from '../../ai/types'

const TAB_ICON: Record<AITabType, string> = {
  chat: '💬',
  organize: '🗂',
  labels: '🏷',
  settings: '⚙',
}

const TAB_LABELS: Record<AITabType, string> = {
  chat: '新对话',
  organize: '整理书签',
  labels: '自动标签',
  settings: 'AI 设置',
}

/**
 * 浮窗内的 Tab 切换条。
 * - 横向滚动避免 tab 多了挤爆
 * - 「+」按钮：弹出菜单选择新 tab 类型
 * - 单个 tab：点击切换；右侧 × 关闭
 * - 持久化：tabs 数组在 store 中已被持久化，刷新后恢复
 *
 * 实现注意：
 *  + 按钮的下拉菜单不复用 CardMenu，而是直接用内联 useState + portal，
 *  避免 CardMenu 的事件链 / z-index 体系在浮窗内出意外。
 */
export function AIPanelTabs() {
  const tabs = useAIPanelStore((s) => s.tabs)
  const activeTabId = useAIPanelStore((s) => s.activeTabId)
  const setActiveTab = useAIPanelStore((s) => s.setActiveTab)
  const closeTab = useAIPanelStore((s) => s.closeTab)
  const addTab = useAIPanelStore((s) => s.addTab)
  const detachTab = useSecondaryPanelsStore((s) => s.detach)
  // 拉 panels 数组本身（zustand 严格相等比较，仅 push/filter 才变），
  // 再 useMemo 算 Set 给 detachedTabIds.has() 用 —— 避免每次新建 Set 触发重渲
  const secondaryPanels = useSecondaryPanelsStore((s) => s.panels)
  const detachedTabIds = useMemo(
    () => new Set(secondaryPanels.map((p) => p.tabId)),
    [secondaryPanels],
  )

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
        const detached = detachedTabIds.has(t.id)
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
            {/* 已分离标记：tab 同时被某个副浮窗承载 */}
            {detached && (
              <span
                className="text-[9px] text-fuchsia-500 leading-none shrink-0"
                title="该 tab 已在副浮窗中显示"
                aria-label="已分离"
              >
                ⤴
              </span>
            )}
            {/* 分离按钮：仅未分离时显示 */}
            {!detached && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  detachTab(t.id)
                }}
                className={cn(
                  'w-4 h-4 inline-flex items-center justify-center rounded text-[10px] shrink-0',
                  'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity',
                  'text-slate-400 hover:text-fuchsia-500 hover:bg-fuchsia-50 dark:hover:bg-fuchsia-500/10',
                )}
                title="分离为独立浮窗"
                aria-label="分离为独立浮窗"
              >
                ⤴
              </button>
            )}
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
              title={
                detached
                  ? '关闭此标签（同时会关闭副浮窗）'
                  : '关闭此标签'
              }
              aria-label="关闭此标签"
            >
              ✕
            </button>
          </div>
        )
      })}

      {/* 新建 tab 菜单（自管理 popover） */}
      <NewTabMenu onPick={(type) => addTab(type)} />
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
 * NewTabMenu：一个简化的内联下拉菜单
 *
 * - 触发按钮：右下角 + 图标
 * - 点击 → 切换 open
 * - open 后用 portal 把菜单渲染到 body 上，z-index = 10200（高于浮窗 10100）
 * - 菜单位置基于 + 按钮 boundingRect 实时算
 * - 点击菜单外部 / Esc → 关闭
 * - 点击菜单项 → addTab + 关闭
 * ───────────────────────────────────────────────────────────── */

function NewTabMenu({ onPick }: { onPick: (type: AITabType) => void }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  // 计算菜单位置（基于按钮坐标）
  useLayoutEffect(() => {
    if (!open) return
    const update = () => {
      const btn = btnRef.current
      if (!btn) return
      const rect = btn.getBoundingClientRect()
      const menuWidth = 160
      const vw = window.innerWidth
      const vh = window.innerHeight
      // 默认菜单在按钮下方左对齐；如果会超出右边缘，靠右对齐
      let left = rect.left
      if (left + menuWidth > vw - 8) left = vw - menuWidth - 8
      if (left < 8) left = 8
      // 默认下方；下方放不下时往上展开
      const estHeight = 4 * 32 + 8
      let top = rect.bottom + 4
      if (top + estHeight > vh - 8) {
        top = Math.max(8, rect.top - estHeight - 4)
      }
      setPos({ top, left })
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open])

  // 点外部关闭 + Esc
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (btnRef.current?.contains(t)) return
      if (menuRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        className={cn(
          'w-6 h-6 inline-flex items-center justify-center rounded shrink-0',
          'text-slate-400 hover:text-brand',
          'hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors',
          'text-base leading-none',
          open && 'text-brand bg-brand/10',
        )}
        title="新建标签"
        aria-label="新建标签"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        +
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              width: 160,
              zIndex: 10200,
            }}
            className={cn(
              'py-1 rounded-md shadow-lg',
              'bg-white dark:bg-slate-800',
              'border border-slate-200 dark:border-slate-700',
            )}
          >
            <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-slate-400">
              新建标签
            </div>
            {(['chat', 'organize', 'labels', 'settings'] as AITabType[]).map(
              (type) => (
                <button
                  key={type}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false)
                    onPick(type)
                  }}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left',
                    'text-slate-700 dark:text-slate-200',
                    'hover:bg-slate-100 dark:hover:bg-slate-700/60',
                  )}
                >
                  <span className="text-sm leading-none" aria-hidden>
                    {TAB_ICON[type]}
                  </span>
                  <span className="truncate">{TAB_LABELS[type]}</span>
                </button>
              ),
            )}
          </div>,
          document.body,
        )}
    </>
  )
}
