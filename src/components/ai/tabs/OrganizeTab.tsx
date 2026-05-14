import { PlaceholderTab } from './PlaceholderTab'

/**
 * 「整理」Tab 占位（V1.0 阶段）
 * 真实实现在 V1.0 任务 4.2「AI 整理书签助手」
 */
export function OrganizeTab() {
  return (
    <PlaceholderTab
      emoji="🗂"
      title="AI 整理书签"
      description="让 AI 帮你按主题自动归类。整理结果会先以 diff 形式预览，你可以挑选接受哪些建议，应用后 60s 内可一键撤销。"
      cta="即将开放（V1.0 任务 4.2）"
    />
  )
}
