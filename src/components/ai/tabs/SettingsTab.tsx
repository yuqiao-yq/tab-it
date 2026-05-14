import { PlaceholderTab } from './PlaceholderTab'

/**
 * 「设置」Tab 占位（V1.0 阶段）
 * 真实实现在 V1.0 任务 4.1「第三方 API 入口」
 */
export function SettingsTab() {
  return (
    <PlaceholderTab
      emoji="⚙"
      title="AI 设置"
      description="配置你自己的 AI 服务（DeepSeek / OpenAI / Azure / 自部署 Ollama 等），所有 AI 功能用你的额度。API Key 仅本地存储，绝不上传。"
      cta="即将开放（V1.0 任务 4.1）"
    />
  )
}
