import { useEffect } from 'react'
import { useAIPanelStore } from '../../ai/panel/usePanelStore'
import { useSecondaryPanelsStore } from '../../ai/panel/useSecondaryPanelsStore'
import { SecondaryPanelView } from './SecondaryPanelView'

/**
 * 副浮窗渲染容器（V3.0 §7.3）
 *
 * 职责：
 * 1. 遍历 useSecondaryPanelsStore.panels 渲染所有副浮窗
 * 2. 同步异常清理：当主 store 中某 tabId 已不存在（用户在主浮窗 ✕ 关掉）时，
 *    把对应的副浮窗也清掉，避免空壳
 *
 * 这一层不参与拖动 / 缩放等逻辑，所有交互都在 SecondaryPanelView 内部完成。
 */
export function SecondaryPanelsHost() {
  const panels = useSecondaryPanelsStore((s) => s.panels)
  const removeByTabId = useSecondaryPanelsStore((s) => s.removeByTabId)
  const tabs = useAIPanelStore((s) => s.tabs)

  // 同步清理：扫一遍副浮窗中"已不存在的 tabId"，让 store 删掉
  // 用 Effect 而非渲染时 set，避免 React 警告"渲染中调用 setState"
  useEffect(() => {
    const existingTabIds = new Set(tabs.map((t) => t.id))
    for (const p of panels) {
      if (!existingTabIds.has(p.tabId)) {
        removeByTabId(p.tabId)
      }
    }
  }, [tabs, panels, removeByTabId])

  return (
    <>
      {panels.map((p) => (
        <SecondaryPanelView key={p.id} panel={p} />
      ))}
    </>
  )
}
