import { PlaceholderTab } from './PlaceholderTab'

/**
 * 「标签」Tab 占位（V1.0 阶段）
 * 真实实现在 V1.0 任务 4.4「自动打标签 + Tag 系统」
 */
export function LabelsTab() {
  return (
    <PlaceholderTab
      emoji="🏷"
      title="自动打标签"
      description="AI 批量为书签生成主题标签（如「前端」「设计」「工具」），让你能在搜索框用 #tag 快速过滤、跨分类找到相关书签。"
      cta="即将开放（V1.0 任务 4.4）"
    />
  )
}
