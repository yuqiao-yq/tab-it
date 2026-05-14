/**
 * AI 模块公共类型
 *
 * 这一层只放跨子模块（panel / providers / services）共用的类型，
 * 子模块自己的内部类型放到对应文件里。
 */

// ─── Provider 抽象 ───────────────────────────────────────

/**
 * Provider 类型。
 * - openai-compatible: OpenAI / DeepSeek / Azure / 智谱 / Moonshot / Ollama / vLLM / Together
 *                      / Groq / OpenRouter / SiliconFlow 等都走这个 adapter
 * - window-ai:        Chrome 138+ 内置 Gemini Nano（完全本地，零成本零隐私）
 * - ollama:           预留；当前用 openai-compatible 也能覆盖
 */
export type ProviderType = 'openai-compatible' | 'window-ai' | 'ollama'

/**
 * 用户配置的一个 Provider。
 * apiKey 仅存 chrome.storage.local，永不出包（不进 sync 也不进 export json）
 */
export interface AIProviderConfig {
  id: string
  name: string
  type: ProviderType
  baseURL?: string
  apiKey?: string
  model: string
  embeddingModel?: string
}

/** 任务 → Provider id 的路由配置 */
export interface AIRouting {
  chat: string
  organize: string
  embedding: string
}

export interface AIPrivacy {
  anonymousMode: boolean
  allowContentCrawl: boolean
  showCostEstimate: boolean
}

/**
 * 整体 AI 设置。
 * - enabled=false 时所有 AI UI 入口都不工作
 * - providers 至少 1 个且 routing 指向有效 id 时，才算"已配置"
 */
export interface AISettings {
  enabled: boolean
  providers: AIProviderConfig[]
  routing: Partial<AIRouting>
  privacy: AIPrivacy
  preferLocal: boolean
}

// ─── Chat 接口 ───────────────────────────────────────────

export type ChatRole = 'system' | 'user' | 'assistant'

export interface ChatMessage {
  role: ChatRole
  content: string
}

export interface ChatOptions {
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  responseFormat?: 'text' | 'json'
  signal?: AbortSignal
}

export interface ChatUsage {
  promptTokens: number
  completionTokens: number
}

export interface ChatResponse {
  text: string
  usage?: ChatUsage
  model?: string
}

export interface ChatChunk {
  delta: string
  done?: boolean
  usage?: ChatUsage
}

// ─── Provider 接口 ──────────────────────────────────────

export interface AIProvider {
  id: string
  type: ProviderType

  chat(opts: ChatOptions): Promise<ChatResponse>
  chatStream?(opts: ChatOptions): AsyncIterable<ChatChunk>
  embedding?(input: string[]): Promise<number[][]>

  testConnection(): Promise<{ ok: boolean; message?: string; latencyMs?: number }>
}

// ─── 默认值 + 工具 ──────────────────────────────────────

export const DEFAULT_AI_SETTINGS: AISettings = {
  enabled: false,
  providers: [],
  routing: {},
  privacy: {
    anonymousMode: true,
    allowContentCrawl: false,
    showCostEstimate: true,
  },
  preferLocal: false,
}

/**
 * 「是否已配置可用 AI」判定：
 * 至少有一个 provider，且 chat routing 指向了一个真实存在的 provider。
 */
export function isAIConfigured(s: AISettings): boolean {
  if (!s.enabled) return false
  if (s.providers.length === 0) return false
  const chatId = s.routing.chat
  if (!chatId) return false
  return s.providers.some((p) => p.id === chatId)
}


// ─── 浮窗 Tab 类型 ──────────────────────────────────────

/**
 * Tab 的种类。
 * - chat:     RAG 对话（V2 才接通；V1 阶段做占位）
 * - organize: AI 整理书签
 * - labels:   自动打标签 + 标签管理
 * - settings: AI Provider 与隐私设置
 *
 * 一个浮窗内可以同时挂多个相同 type 的 tab（例如多对话），
 * 每个 tab 有自己的 id 与独立 state。
 */
export type AITabType = 'chat' | 'organize' | 'labels' | 'settings'

export interface AIPanelTab {
  /** 全局唯一 id（uuid） */
  id: string
  type: AITabType
  /** Tab 标题，对话 tab 自动从首条提问生成 */
  title: string
  /**
   * Tab 自有 state（任意 JSON 可序列化结构）；
   * 关闭浮窗 / 切换 tab 时不丢失，会随 panel 一并持久化到 storage。
   * 各 tab 组件自行解释结构。
   */
  state?: Record<string, unknown>
  createdAt: number
}

export interface PanelPosition {
  x: number
  y: number
}

export interface PanelSize {
  width: number
  height: number
}

// ─── 浮窗常量 ──────────────────────────────────────────

export const PANEL_DEFAULT_SIZE: PanelSize = { width: 380, height: 520 }
export const PANEL_MIN_SIZE: PanelSize = { width: 280, height: 360 }
/** 最大宽度按视口百分比；最大高度 80vh，运行时计算 */
export const PANEL_MAX_WIDTH = 720
export const PANEL_MAX_HEIGHT_RATIO = 0.8

/** 边界保护：拖动后浮窗至少有这么多像素留在视口里，防止"找不回来" */
export const PANEL_VIEWPORT_PAD = 100

/** FAB 物理参数 */
export const FAB_SIZE = 52
export const FAB_OFFSET = { right: 24, bottom: 24 }

/** 默认浮窗位置：避开 FAB（FAB 在右下，浮窗在 FAB 上方一点） */
export function defaultPanelPosition(viewport: { width: number; height: number }): PanelPosition {
  // 距右 24，距底 96（让出 FAB 和呼吸空间）
  return {
    x: viewport.width - PANEL_DEFAULT_SIZE.width - 24,
    y: viewport.height - PANEL_DEFAULT_SIZE.height - 96,
  }
}
