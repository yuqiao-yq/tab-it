import type { AISettings, ChatMessage } from '../types'
import { getProviderFor } from '../manager'
import {
  buildRagSystemPrompt,
  retrieveContext,
  type RetrievedDoc,
} from './retriever'
import type { BookmarkCard } from '../../types/bookmark'

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

// ─── RAG 模式（V2.0 §6.2） ─────────────────────────

export interface RunRagChatOptions {
  /** 用户最新一条提问文本（用于 retrieve） */
  query: string
  /** 完整对话历史（含本次 query 的 user 消息），最终发给模型 */
  messages: ChatMessage[]
  /** 用于在 cards 中检索语义命中的所有书签 */
  cards: BookmarkCard[]
  settings: AISettings
  signal?: AbortSignal
  onDelta?: (delta: string, full: string) => void
  onRetrieved?: (docs: RetrievedDoc[]) => void
}

export interface RunRagChatResult {
  text: string
  model?: string
  /** 本次召回的来源；UI 用来渲染底部引用列表 */
  retrieved: RetrievedDoc[]
}

/**
 * RAG 对话主流程：
 *   1. 用 query 做 embedding 检索 top K 文档
 *   2. 把命中文档拼成 system prompt
 *   3. 流式问答；返回时附带 retrieved，UI 据此渲染引用 / 跳转
 *
 * 没召回任何文档时仍会调 LLM 回答，但 system prompt 会引导模型说明
 * "本回答不来自你的收藏"，避免误导。
 */
export async function runRagChat(
  opts: RunRagChatOptions,
): Promise<RunRagChatResult> {
  const provider = getProviderFor('chat', opts.settings)
  if (!provider) {
    throw new Error('未配置可用的对话 Provider，请先去「⚙ 设置」添加')
  }

  // Step 1: retrieve（在调 LLM 前完成；让用户先看到底部引用，再等流式）
  const docs = await retrieveContext({
    query: opts.query,
    cards: opts.cards,
    settings: opts.settings,
    signal: opts.signal,
  })
  opts.onRetrieved?.(docs)

  // Step 2: 构造带 RAG 上下文的 messages
  // 把已有对话历史前置一条 system prompt（替换 / 不包含历史里的 system）
  const ragSystem: ChatMessage = {
    role: 'system',
    content: buildRagSystemPrompt(docs),
  }
  const cleanedHistory = opts.messages.filter((m) => m.role !== 'system')
  const finalMessages: ChatMessage[] = [ragSystem, ...cleanedHistory]

  // Step 3: 流式调用
  let full = ''
  let model: string | undefined
  if (provider.chatStream) {
    for await (const chunk of provider.chatStream({
      messages: finalMessages,
      signal: opts.signal,
      temperature: 0.3, // RAG 场景温度低一点，更贴近事实
    })) {
      if (chunk.delta) {
        full += chunk.delta
        opts.onDelta?.(chunk.delta, full)
      }
      if (chunk.done) break
    }
  } else {
    // 兜底：非流式
    const r = await provider.chat({
      messages: finalMessages,
      signal: opts.signal,
      temperature: 0.3,
    })
    full = r.text
    model = r.model
    opts.onDelta?.(r.text, r.text)
  }
  return { text: full, model, retrieved: docs }
}
