import type { AISettings, ChatMessage, ChatChunk } from '../types'
import { getProviderFor } from '../manager'

/**
 * 对话 service：薄薄一层包装 provider.chatStream，统一中止 / 错误处理。
 *
 * - 流式优先：所有 provider 都实现了 chatStream（OpenAICompatible 用 SSE，window.ai 包装异步迭代器）
 * - 不带 RAG：消息直接发给 LLM，不注入额外 context
 *   （V2.0 §6.2 接通 RAG 后，这里会前置一个 retrieve 步骤）
 * - 中止：通过 AbortController.signal 传给 provider
 */

export interface RunChatOptions {
  messages: ChatMessage[]
  settings: AISettings
  signal?: AbortSignal
  /** 流式增量回调（每次 yield 都会触发） */
  onDelta?: (delta: string, full: string) => void
}

export interface RunChatResult {
  text: string
  /** 实际使用的模型（可能由 provider 覆盖） */
  model?: string
}

export async function runChat(opts: RunChatOptions): Promise<RunChatResult> {
  const provider = getProviderFor('chat', opts.settings)
  if (!provider) {
    throw new Error('未配置可用的对话 Provider，请先去「⚙ 设置」添加')
  }
  if (!provider.chatStream) {
    // 兜底：没有 stream 就走非流式
    const r = await provider.chat({
      messages: opts.messages,
      signal: opts.signal,
      temperature: 0.7,
    })
    opts.onDelta?.(r.text, r.text)
    return { text: r.text, model: r.model }
  }

  let full = ''
  let model: string | undefined
  for await (const chunk of provider.chatStream({
    messages: opts.messages,
    signal: opts.signal,
    temperature: 0.7,
  })) {
    if (chunk.delta) {
      full += chunk.delta
      opts.onDelta?.(chunk.delta, full)
    }
    if (chunk.done) break
  }
  return { text: full, model }
}

/**
 * 给 tab 起个标题：截取首条用户消息的前 12 字符。
 */
export function suggestChatTitle(messages: ChatMessage[]): string | undefined {
  const first = messages.find((m) => m.role === 'user')
  if (!first) return undefined
  const text = first.content.replace(/\s+/g, ' ').trim()
  if (!text) return undefined
  return text.length > 12 ? text.slice(0, 12) + '…' : text
}
