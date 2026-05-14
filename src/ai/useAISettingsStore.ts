import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import { browser } from 'wxt/browser'
import {
  DEFAULT_AI_SETTINGS,
  type AIProviderConfig,
  type AISettings,
  type ProviderType,
} from './types'

/**
 * AI 设置 store
 *
 * 设计：
 * - 与 useBookmarkStore 解耦（AI 是独立子系统，互不依赖）
 * - 持久化到 chrome.storage.local（**永不**进 sync 也不进 export json，
 *   因为里面包含 apiKey）
 * - 增删改 Provider 都自动写库（debounce 200ms）
 * - 「是否已配置」由 isAIConfigured(settings) 计算（types.ts 中导出）
 */

const STORAGE_KEY = 'tabit:ai-settings'

interface AISettingsStore extends AISettings {
  hydrated: boolean

  init: () => Promise<void>

  // 整体开关
  setEnabled: (v: boolean) => void
  setPreferLocal: (v: boolean) => void

  // 隐私
  patchPrivacy: (patch: Partial<AISettings['privacy']>) => void

  // Provider CRUD
  addProvider: (input: Omit<AIProviderConfig, 'id'>) => string
  updateProvider: (id: string, patch: Partial<AIProviderConfig>) => void
  removeProvider: (id: string) => void

  // Routing
  setRoute: (task: 'chat' | 'organize' | 'embedding', providerId: string) => void
}

export const useAISettingsStore = create<AISettingsStore>((set, get) => ({
  ...DEFAULT_AI_SETTINGS,
  hydrated: false,

  async init() {
    try {
      const result = await browser.storage.local.get(STORAGE_KEY)
      const raw = result[STORAGE_KEY] as AISettings | undefined
      if (raw) {
        // 防御：缺失字段用默认值兜底
        const safe: AISettings = {
          enabled: !!raw.enabled,
          providers: Array.isArray(raw.providers) ? raw.providers : [],
          routing: raw.routing ?? {},
          privacy: { ...DEFAULT_AI_SETTINGS.privacy, ...(raw.privacy ?? {}) },
          preferLocal: !!raw.preferLocal,
        }
        set({ ...safe, hydrated: true })
      } else {
        set({ hydrated: true })
      }
    } catch {
      set({ hydrated: true })
    }
  },

  setEnabled(v) {
    set({ enabled: v })
    persist(get())
  },

  setPreferLocal(v) {
    set({ preferLocal: v })
    persist(get())
  },

  patchPrivacy(patch) {
    set((s) => ({ privacy: { ...s.privacy, ...patch } }))
    persist(get())
  },

  addProvider(input) {
    const id = uuid()
    const newProvider: AIProviderConfig = { id, ...input }
    set((s) => {
      const providers = [...s.providers, newProvider]
      // 第一个 provider 自动用作所有 task 的默认路由 + 自动启用 AI
      const isFirst = s.providers.length === 0
      return {
        providers,
        enabled: s.enabled || isFirst,
        routing: isFirst
          ? { chat: id, organize: id, embedding: id }
          : s.routing,
      }
    })
    persist(get())
    return id
  },

  updateProvider(id, patch) {
    set((s) => ({
      providers: s.providers.map((p) =>
        p.id === id ? { ...p, ...patch, id: p.id } : p,
      ),
    }))
    persist(get())
  },

  removeProvider(id) {
    set((s) => {
      const providers = s.providers.filter((p) => p.id !== id)
      // 如果路由指向了被删的 provider，重置到第一个剩余的（或清空）
      const fix = (curr?: string) =>
        curr === id ? providers[0]?.id : curr
      return {
        providers,
        routing: {
          chat: fix(s.routing.chat),
          organize: fix(s.routing.organize),
          embedding: fix(s.routing.embedding),
        },
        // 全删光时关闭 AI（防止"启用但无 provider"的尴尬态）
        enabled: providers.length > 0 ? s.enabled : false,
      }
    })
    persist(get())
  },

  setRoute(task, providerId) {
    set((s) => ({ routing: { ...s.routing, [task]: providerId } }))
    persist(get())
  },
}))

// ─── 持久化（debounce 200ms） ────────────────────────

let persistTimer: ReturnType<typeof setTimeout> | null = null

function persist(state: AISettingsStore) {
  if (!state.hydrated) return
  const data: AISettings = {
    enabled: state.enabled,
    providers: state.providers,
    routing: state.routing,
    privacy: state.privacy,
    preferLocal: state.preferLocal,
  }
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    void browser.storage.local.set({ [STORAGE_KEY]: data }).catch(() => {
      /* storage 异常不影响内存 */
    })
    persistTimer = null
  }, 200)
}

// ─── 推荐预设（让用户快速起步） ──────────────────────

export interface ProviderPreset {
  type: ProviderType
  name: string
  baseURL: string
  defaultModel: string
  defaultEmbeddingModel?: string
  description: string
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    type: 'openai-compatible',
    name: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    description: '高性价比；deepseek-chat 适合通用对话，deepseek-reasoner 推理强',
  },
  {
    type: 'openai-compatible',
    name: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    defaultEmbeddingModel: 'text-embedding-3-small',
    description: '官方；gpt-4o-mini 便宜，gpt-4o 强',
  },
  {
    type: 'openai-compatible',
    name: 'Moonshot Kimi',
    baseURL: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-8k',
    description: 'Kimi；长上下文友好',
  },
  {
    type: 'openai-compatible',
    name: '智谱 GLM',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-flash',
    description: '智谱；glm-4-flash 免费 / glm-4 付费',
  },
  {
    type: 'openai-compatible',
    name: 'OpenRouter',
    baseURL: 'https://openrouter.ai/api/v1',
    defaultModel: 'anthropic/claude-3.5-sonnet',
    description: '聚合；可访问 Claude / Gemini / Llama 等几十种模型',
  },
  {
    type: 'openai-compatible',
    name: 'Ollama (本地)',
    baseURL: 'http://localhost:11434/v1',
    defaultModel: 'llama3.2',
    description: '本地部署；apiKey 留空',
  },
  {
    type: 'window-ai',
    name: 'Chrome 内置 AI',
    baseURL: '',
    defaultModel: 'gemini-nano',
    description:
      'Chrome 138+ 本地 Gemini Nano，零成本零隐私。⚠️ 当前仅支持 en/es/ja，中文场景不推荐',
  },
]
