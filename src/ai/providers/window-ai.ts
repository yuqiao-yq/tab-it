import type {
  AIProvider,
  AIProviderConfig,
  ChatChunk,
  ChatMessage,
  ChatOptions,
  ChatResponse,
} from '../types'

/**
 * Window.ai Provider（Chrome 138+ 内置 Gemini Nano）
 *
 * - 完全本地推理，零成本零隐私
 * - 但能力较弱（适合分类 / 总结，不适合复杂推理）
 * - API 还在演进中，目前是 `window.ai.assistant` 命名空间
 *
 * 实现策略：
 * - 启动时探测 `window.ai?.assistant?.capabilities()`
 * - 不支持时 testConnection 返回 ok=false，UI 自动 fallback 到远程 Provider
 *
 * 参考：https://developer.chrome.com/docs/ai/built-in
 */

// 动态可选的浏览器 API 类型，避免 TS 报错
interface WindowAIBuiltin {
  ai?: {
    assistant?: {
      capabilities?: () => Promise<{
        available: 'no' | 'readily' | 'after-download'
      }>
      create?: (opts?: { systemPrompt?: string }) => Promise<{
        prompt: (input: string) => Promise<string>
        promptStreaming: (input: string) => AsyncIterable<string>
        destroy: () => void
      }>
    }
  }
}

export class WindowAIProvider implements AIProvider {
  readonly id: string
  readonly type = 'window-ai' as const

  constructor(config: AIProviderConfig) {
    this.id = config.id
  }

  // ─── 静态可用性探测 ────────────────────────────────────

  static async isAvailable(): Promise<boolean> {
    try {
      const w = window as unknown as WindowAIBuiltin
      const caps = await w.ai?.assistant?.capabilities?.()
      return caps?.available === 'readily'
    } catch {
      return false
    }
  }

  // ─── chat ─────────────────────────────────────────────

  async chat(opts: ChatOptions): Promise<ChatResponse> {
    const session = await this.createSession(opts)
    try {
      const merged = mergeMessagesToPrompt(opts.messages)
      const text = await session.prompt(merged)
      return { text, model: 'window.ai (Gemini Nano)' }
    } finally {
      session.destroy()
    }
  }

  // ─── chatStream ───────────────────────────────────────

  async *chatStream(opts: ChatOptions): AsyncGenerator<ChatChunk, void, void> {
    const session = await this.createSession(opts)
    try {
      const merged = mergeMessagesToPrompt(opts.messages)
      const stream = session.promptStreaming(merged)
      let prev = ''
      for await (const chunk of stream) {
        // window.ai 流式输出是「累积」的全文，我们要换算成 delta
        const delta = chunk.slice(prev.length)
        prev = chunk
        if (delta) yield { delta }
      }
      yield { delta: '', done: true }
    } finally {
      session.destroy()
    }
  }

  // ─── testConnection ───────────────────────────────────

  async testConnection(): Promise<{ ok: boolean; message?: string; latencyMs?: number }> {
    const ok = await WindowAIProvider.isAvailable()
    if (!ok) {
      return {
        ok: false,
        message:
          'Chrome 内置 AI 不可用。需要 Chrome 138+ 并在 chrome://flags 启用 "Prompt API for Gemini Nano"',
      }
    }
    const start = Date.now()
    try {
      const r = await this.chat({
        messages: [{ role: 'user', content: 'hi' }],
        maxTokens: 5,
      })
      const latencyMs = Date.now() - start
      return r.text
        ? { ok: true, latencyMs, message: `本地 AI 可用 (${latencyMs}ms)` }
        : { ok: false, message: '本地 AI 返回空响应' }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  }

  // ─── 内部工具 ─────────────────────────────────────────

  private async createSession(opts: ChatOptions) {
    const w = window as unknown as WindowAIBuiltin
    const create = w.ai?.assistant?.create
    if (!create) {
      throw new Error('window.ai.assistant 不可用，请检查浏览器版本与 flags')
    }
    // 把 system message 提取出来作为 systemPrompt
    const systemPrompt = opts.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n')
    return create({ systemPrompt: systemPrompt || undefined })
  }
}

/** 把多轮 messages 合并成单字符串 prompt（window.ai 不支持多轮 message 数组） */
function mergeMessagesToPrompt(messages: ChatMessage[]): string {
  const lines: string[] = []
  for (const m of messages) {
    if (m.role === 'system') continue // system 已通过 systemPrompt 传入
    const prefix = m.role === 'user' ? 'User' : 'Assistant'
    lines.push(`${prefix}: ${m.content}`)
  }
  lines.push('Assistant:')
  return lines.join('\n')
}


