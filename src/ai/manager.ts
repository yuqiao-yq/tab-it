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
 * - 优先用 routing 中明确指定的
 * - 否则 fallback 到第一个 provider
 * - 都没有 → null
 */
export function getProviderFor(
  task: AITask,
  settings: AISettings,
): AIProvider | null {
  if (!settings.enabled || settings.providers.length === 0) return null
  const id = settings.routing[task] ?? settings.providers[0].id
  const config = settings.providers.find((p) => p.id === id)
  if (!config) return null
  return makeProvider(config)
}

/**
 * 简易测试连接：根据一个 config 实例化 provider 并调 testConnection。
 * 给设置 UI 直接用，免得调用方关心 Provider 类型。
 */
export async function testConnection(config: AIProviderConfig) {
  const provider = makeProvider(config)
  return provider.testConnection()
}
