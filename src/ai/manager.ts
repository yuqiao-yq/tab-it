import { OpenAICompatibleProvider } from './providers/openai-compatible'
import { WindowAIProvider } from './providers/window-ai'
import type {
  AIProvider,
  AIProviderConfig,
  AIRouting,
  AISettings,
} from './types'

/**
 * Provider 工厂 + 任务路由
 *
 * 调用方不直接 new Provider，而是通过 `getProviderFor(task, settings)` 拿一个 instance。
 * 这样将来要做"先尝试 window.ai，失败 fallback 到远程"等策略，也只在这里改。
 */

export type AITask = keyof AIRouting

/** 根据 config 实例化对应 Provider */
export function makeProvider(config: AIProviderConfig): AIProvider {
  switch (config.type) {
    case 'window-ai':
      return new WindowAIProvider(config)
    case 'openai-compatible':
    case 'ollama': // ollama 走 OpenAI 兼容
      return new OpenAICompatibleProvider(config)
  }
}

/**
 * 取某个任务（chat / organize / embedding）应该用哪个 Provider。
 * - V1.5 §5.3：当 settings.preferLocal=true 且任务属于"简单 chat 类"时，
 *   优先用用户已添加的 type='window-ai' Provider；找不到时再走 routing
 * - 否则用 routing 中明确指定的
 * - 兜底到第一个 provider
 * - 都没有 → null
 *
 * 设计取舍：window.ai 仅适合"简单 chat"（Gemini Nano 中文支持差、不支持 embedding、
 * 大批量 organize 也不擅长）。所以这里"prefer local"只对 chat 生效；
 * organize / embedding 仍走 routing 指定的远程 provider。
 */
export function getProviderFor(
  task: AITask,
  settings: AISettings,
): AIProvider | null {
  if (!settings.enabled || settings.providers.length === 0) return null

  // §5.3 prefer local 路由优先级
  if (settings.preferLocal && isLocalFriendly(task)) {
    const localCfg = settings.providers.find((p) => p.type === 'window-ai')
    if (localCfg) return makeProvider(localCfg)
  }

  const id = settings.routing[task] ?? settings.providers[0].id
  const config = settings.providers.find((p) => p.id === id)
  if (!config) return null
  return makeProvider(config)
}

/**
 * 这些任务 prefer-local 时优先走 window.ai；其他任务（organize 大批量、
 * embedding 向量生成）始终走 routing 指定的远程 provider。
 */
function isLocalFriendly(task: AITask): boolean {
  return task === 'chat'
}

/**
 * 简易测试连接：根据一个 config 实例化 provider 并调 testConnection。
 * 给设置 UI 直接用，免得调用方关心 Provider 类型。
 */
export async function testConnection(config: AIProviderConfig) {
  const provider = makeProvider(config)
  return provider.testConnection()
}
