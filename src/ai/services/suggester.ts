import type { AISettings, ChatMessage } from '../types'
import { getProviderFor } from '../manager'
import { collectTagUsage } from './tagger'
import type { BookmarkCard, Category } from '../../types/bookmark'

/**
 * AI 添加书签辅助 service（V1.0 §4.3）
 *
 * 单条调用：给定一个待添加的网页（title + url），让 LLM 一次性建议：
 *   - 应该归到现有分类中的哪一个（找不到合适的就不给）
 *   - 一句话简介（作为备注）
 *   - 2-4 个中文短标签（优先复用全库已有标签）
 *
 * 与 organizer / tagger 不同点：
 *   - 单条同步调用，没有分批 / 进度
 *   - 必须把候选范围限定在「现有分类」内，不允许 AI 新建分类
 *     （popup 即时态决定不引入"新建分类"的复杂决策）
 *   - 失败时直接抛错给 popup 处理，不写入任何状态
 */

export interface SuggestionInput {
  /** 待建议的网页 */
  page: { title: string; url: string }
  /** 现有分类（用于约束 AI 在已有树中选择） */
  categories: Category[]
  /** 现有书签（仅用于推导 existingTags 频次） */
  cards: BookmarkCard[]
  settings: AISettings
  /** 中止信号 */
  signal?: AbortSignal
}

export interface SuggestionResult {
  /** 命中的分类 id（找不到 / AI 没给 → undefined） */
  suggestedCategoryId?: string
  /** AI 生成的描述（≤ 60 字；空字符串表示没建议） */
  description: string
  /** AI 生成的标签（已轻量标准化） */
  tags: string[]
  /** 调用元数据（给 UI 显示来源 / 成本可选） */
  meta: {
    provider: string
    model: string
    promptTokens: number
    completionTokens: number
  }
}

// ─── 标签轻量标准化（与 tagger 一致口径） ─────────

function lightNormalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of tags) {
    if (typeof raw !== 'string') continue
    const t = raw.trim().slice(0, 6)
    if (!t) continue
    const key = t.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
    if (out.length >= 5) break
  }
  return out
}

// ─── Prompt 构造 ────────────────────────────────

function buildPrompt(input: {
  title: string
  domain: string
  categoryNames: string[]
  existingTags: string[]
}): ChatMessage[] {
  const system = `你是一个浏览器书签助手。用户即将收藏一条网页（title + domain），
你需要一次性给出三件事：
1. categoryName：该书签应归到哪个分类。**只能从「现有分类」中选一个**，找不到合适的就留空字符串
2. description：≤ 30 字的中文简介，描述这个网页是做什么的（不要复述标题）
3. tags：2-4 个中文短标签（每个 ≤ 4 字），优先复用「现有标签」中的同义/同类项

约束：
- 输出必须是合法 JSON，不能有任何额外文本
- categoryName 必须严格等于「现有分类」中的某一个名称（或空字符串）
- tags 是「主题分类」性质（如「前端」「设计」「工具」），不要描述性形容词
- description 实在判断不出主题时给空字符串，宁可不给

返回 JSON Schema：
{
  "categoryName": "前端",
  "description": "面向开发者的 React 官方文档站点",
  "tags": ["前端", "文档", "React"]
}`

  const userParts: string[] = []
  if (input.categoryNames.length > 0) {
    userParts.push(
      '现有分类（只能从中选一个；不合适请留空 categoryName）：\n' +
        input.categoryNames.map((n) => `- ${n}`).join('\n'),
    )
  }
  if (input.existingTags.length > 0) {
    userParts.push(
      '现有标签（优先复用其中同类项）：\n' +
        input.existingTags.map((t) => `#${t}`).join(' '),
    )
  }
  userParts.push(
    `待建议网页：\n- title: ${input.title}\n- domain: ${input.domain}`,
  )

  return [
    { role: 'system', content: system },
    { role: 'user', content: userParts.join('\n\n') },
  ]
}

// ─── 防御性 JSON 解析 ───────────────────────────

interface RawAISuggestion {
  categoryName?: unknown
  description?: unknown
  tags?: unknown
}

function parseAIResponse(text: string): RawAISuggestion {
  const trimmed = text.trim()
  const jsonStr = extractJson(trimmed)
  try {
    return JSON.parse(jsonStr) as RawAISuggestion
  } catch {
    return {}
  }
}

function extractJson(text: string): string {
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(text)
  if (fence) return fence[1].trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) return text.slice(start, end + 1)
  return text
}

// ─── 核心：runSuggester ──────────────────────────

export async function runSuggester(
  opts: SuggestionInput,
): Promise<SuggestionResult> {
  // 复用 organize 路由（chat-class 任务），与 tagger 一致
  const provider = getProviderFor('organize', opts.settings)
  if (!provider) {
    throw new Error('未配置可用的 AI Provider，请先在新标签页里打开浮窗 ⚙ 设置')
  }

  // 提取 domain（与 tagger / organizer 同口径）
  let domain = ''
  try {
    domain = new URL(opts.page.url).hostname.replace(/^www\./, '')
  } catch {
    /* ignore */
  }

  // 全库已有标签 top 30（数量比 tagger 少一点，单条 prompt 不需要太长上下文）
  const existingTags = collectTagUsage(opts.cards)
    .slice(0, 30)
    .map((x) => x.tag)

  // 候选分类：扁平的所有 category names（去重）
  // popup 表单的 select 也是用扁平树，名字一致即可
  const categoryNames = Array.from(new Set(opts.categories.map((c) => c.name)))

  const messages = buildPrompt({
    title: (opts.page.title || '(无标题)').slice(0, 80),
    domain: domain || '(unknown)',
    categoryNames,
    existingTags,
  })

  const res = await provider.chat({
    messages,
    temperature: 0.2,
    maxTokens: 500,
    responseFormat: 'json',
    signal: opts.signal,
  })

  const raw = parseAIResponse(res.text)

  // 解析 categoryName → categoryId
  // - AI 给的名字必须严格在 categoryNames 中（大小写不敏感比对，避免 trim 失败）
  // - 同名重复时取第一个；popup 默认就是「按名字平铺」，重复的语义本来就模糊
  let suggestedCategoryId: string | undefined
  if (typeof raw.categoryName === 'string') {
    const targetName = raw.categoryName.trim()
    if (targetName) {
      const hit = opts.categories.find(
        (c) => c.name.trim().toLowerCase() === targetName.toLowerCase(),
      )
      suggestedCategoryId = hit?.id
    }
  }

  const description =
    typeof raw.description === 'string'
      ? raw.description.trim().slice(0, 60)
      : ''

  const tags = lightNormalizeTags(raw.tags)

  return {
    suggestedCategoryId,
    description,
    tags,
    meta: {
      provider: provider.id,
      model: res.model ?? '',
      promptTokens: res.usage?.promptTokens ?? 0,
      completionTokens: res.usage?.completionTokens ?? 0,
    },
  }
}
