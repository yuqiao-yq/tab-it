import { v4 as uuid } from 'uuid'
import type {
  AISettings,
  ChatMessage,
  TagPlan,
  TagRange,
  TagSuggestion,
} from '../types'
import { getProviderFor } from '../manager'
import { estimateCostCny, estimateTokens } from './organizer'
import type { BookmarkCard, Category } from '../../types/bookmark'

/**
 * AI 自动打标签 service
 *
 * 输入：cards + range（默认仅未打标签的）+ settings
 * 输出：TagPlan（每条卡片一个 newTags 建议；用户预览后可勾选接受/拒绝）
 *
 * 设计要点（与 organizer 对齐）：
 * - 数据切片：仅发送 id + title + domain；不发完整 URL，不发网页内容
 * - 复用全库已有 tag 集合作为 prompt 上下文 → 让 AI 优先复用，降低标签碎片化
 * - 分批：每批 50 条（每条 prompt+output 都比 organize 短，可以多放一点）
 * - JSON 输出 + 防御性解析；tag 在写库前都过 normalizeTags
 */

// ─── 数据切片 ────────────────────────────────────────

interface TagBookmarkSlice {
  id: string
  title: string
  domain: string
  /** 当前 tags（用于让 AI 在已有基础上优化，而不是从零开始） */
  currentTags?: string[]
}

function slice(card: BookmarkCard): TagBookmarkSlice {
  let domain = ''
  try {
    domain = new URL(card.url).hostname.replace(/^www\./, '')
  } catch {
    /* ignore */
  }
  return {
    id: card.id,
    title: (card.title || '(无标题)').slice(0, 80),
    domain: domain || '(unknown)',
    currentTags: card.tags && card.tags.length > 0 ? card.tags : undefined,
  }
}

// ─── 范围 → 待处理书签 ─────────────────────────────────

export function selectCardsForTagging(
  range: TagRange,
  cards: BookmarkCard[],
  categories: Category[],
): BookmarkCard[] {
  switch (range.type) {
    case 'untagged':
      return cards.filter((c) => !c.tags || c.tags.length === 0)
    case 'all':
      return cards
    case 'category': {
      const ids = collectDescendantIds([range.id], categories)
      return cards.filter((c) => ids.has(c.categoryId))
    }
  }
}

function collectDescendantIds(ids: string[], cats: Category[]): Set<string> {
  const result = new Set(ids)
  const queue = [...ids]
  while (queue.length > 0) {
    const pid = queue.shift()!
    for (const c of cats) {
      if (c.parentId === pid && !result.has(c.id)) {
        result.add(c.id)
        queue.push(c.id)
      }
    }
  }
  return result
}

// ─── 标签标准化（与 useBookmarkStore 中 normalizeTags 同口径） ──

/**
 * 注意：useBookmarkStore 中的 normalizeTags 是 module-private（function 而非 export）。
 * 在 store 真正写入时还会再过一次，所以这里"轻量版"已经足够过滤掉明显垃圾。
 * 单 tag ≤ 6 字符（标签语义上常见 2-4 字，6 是宽松上限），整体 ≤ 5 个；
 * 写库时 store 会再裁剪到 12 字符 / 8 个的硬上限。
 */
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

// ─── Prompt 构造 ────────────────────────────────────

const BATCH_SIZE = 50
const MAX_OUTPUT_TOKENS_PER_BATCH = 2000

interface BuildPromptInput {
  bookmarks: TagBookmarkSlice[]
  /** 全库已有 tag 列表（按使用频次倒序，限制前 50 个，避免 prompt 过长） */
  existingTags: string[]
}

function buildPrompt(input: BuildPromptInput): ChatMessage[] {
  const system = `你是一个浏览器书签自动打标签助手。用户会发给你一组书签（id/title/domain，可能附带 currentTags），
你需要为每条书签生成 2-4 个简短的中文主题标签。

约束：
1. 输出必须是合法 JSON，符合给定 Schema，不能有任何额外文本
2. 单个标签长度 ≤ 4 个汉字（如「前端」「设计」「工具」「文档」）
3. 标签是「主题分类」性质，不要描述性形容词（避免「实用」「有趣」「经典」「推荐」等）
4. 优先复用「全库已有标签」中的同义/同类项，避免标签碎片化
5. 保持 bookmark id 不变；不要发明新的 bookmark
6. 如果 currentTags 已经合理（涵盖了主题），可以原样保留；否则给出更精炼的版本
7. 实在无法判断主题时，宁可少给（输出 1 个保底标签也行），不要硬凑

返回 JSON Schema：
{
  "results": [
    { "bookmarkId": "bk_xxx", "tags": ["前端", "文档"] },
    { "bookmarkId": "bk_yyy", "tags": ["设计"] }
  ]
}`

  const userParts: string[] = []
  if (input.existingTags.length > 0) {
    userParts.push(
      '全库已有标签（优先复用其中同类项）：\n' +
        input.existingTags.map((t) => `#${t}`).join(' '),
    )
  }
  userParts.push(
    `待打标签书签（共 ${input.bookmarks.length} 条）：\n` +
      input.bookmarks
        .map((b) => {
          const cur = b.currentTags?.length
            ? ` | 现有tags=[${b.currentTags.join(',')}]`
            : ''
          return `- id=${b.id} | ${b.title} | ${b.domain}${cur}`
        })
        .join('\n'),
  )

  return [
    { role: 'system', content: system },
    { role: 'user', content: userParts.join('\n\n') },
  ]
}

// ─── 防御性 JSON 解析 ───────────────────────────────

interface RawAITagBatch {
  results?: Array<{
    bookmarkId?: string
    tags?: unknown
  }>
}

function parseAIResponse(text: string): RawAITagBatch {
  const trimmed = text.trim()
  const jsonStr = extractJson(trimmed)
  try {
    return JSON.parse(jsonStr) as RawAITagBatch
  } catch {
    return { results: [] }
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

// ─── 全库 tag 频次表 ────────────────────────────────

/**
 * 收集全库所有 tag → 出现次数 map，按次数倒序返回 top N。
 * 给 prompt 用、也给 LabelsTab 的「标签管理」section 用（导出供调用方复用）。
 */
export function collectTagUsage(cards: BookmarkCard[]): Array<{ tag: string; count: number }> {
  const map = new Map<string, number>()
  for (const c of cards) {
    if (!c.tags) continue
    for (const t of c.tags) {
      map.set(t, (map.get(t) ?? 0) + 1)
    }
  }
  return Array.from(map.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}

// ─── 核心：runTagger ───────────────────────────────

export interface RunTaggerOptions {
  range: TagRange
  cards: BookmarkCard[]
  categories: Category[]
  settings: AISettings
  signal?: AbortSignal
  onProgress?: (done: number, total: number) => void
}

export async function runTagger(opts: RunTaggerOptions): Promise<TagPlan> {
  // 复用 organize 的 provider 路由（标签生成本质也是 chat 任务）
  const provider = getProviderFor('organize', opts.settings)
  if (!provider) {
    throw new Error('未配置可用的 AI Provider，请先去「⚙ 设置」添加')
  }

  const targetCards = selectCardsForTagging(opts.range, opts.cards, opts.categories)
  if (targetCards.length === 0) {
    throw new Error('选定范围内没有需要打标签的书签')
  }

  // 取全库已有 tag 频次 top 50 作为 prompt 上下文
  const existingTags = collectTagUsage(opts.cards)
    .slice(0, 50)
    .map((x) => x.tag)

  const slices = targetCards.map(slice)

  // 分批
  const batches: TagBookmarkSlice[][] = []
  for (let i = 0; i < slices.length; i += BATCH_SIZE) {
    batches.push(slices.slice(i, i + BATCH_SIZE))
  }

  const oldTagsMap = new Map(targetCards.map((c) => [c.id, c.tags]))
  const allSuggestions: TagSuggestion[] = []
  let totalPromptTokens = 0
  let totalCompletionTokens = 0
  let modelUsed = ''

  for (let b = 0; b < batches.length; b++) {
    if (opts.signal?.aborted) {
      throw new Error('用户已取消')
    }
    const batch = batches[b]
    const messages = buildPrompt({
      bookmarks: batch,
      existingTags,
    })

    const res = await provider.chat({
      messages,
      temperature: 0.2,
      maxTokens: MAX_OUTPUT_TOKENS_PER_BATCH,
      responseFormat: 'json',
      signal: opts.signal,
    })
    if (res.usage) {
      totalPromptTokens += res.usage.promptTokens
      totalCompletionTokens += res.usage.completionTokens
    }
    if (res.model) modelUsed = res.model

    const raw = parseAIResponse(res.text)
    const batchIds = new Set(batch.map((b) => b.id))
    for (const r of raw.results ?? []) {
      const bid = typeof r.bookmarkId === 'string' ? r.bookmarkId.trim() : ''
      if (!bid || !batchIds.has(bid)) continue
      const newTags = lightNormalizeTags(r.tags)
      if (newTags.length === 0) continue // 没建议就不建议，预览阶段也不显示
      allSuggestions.push({
        bookmarkId: bid,
        oldTags: oldTagsMap.get(bid),
        newTags,
      })
    }

    opts.onProgress?.(b + 1, batches.length)
  }

  return {
    id: uuid(),
    createdAt: Date.now(),
    range: opts.range,
    suggestions: allSuggestions,
    meta: {
      provider: provider.id,
      model: modelUsed,
      promptTokens: totalPromptTokens,
      completionTokens: totalCompletionTokens,
      estimatedCostCny: estimateCostCny(modelUsed, totalPromptTokens, totalCompletionTokens),
    },
  }
}

// ─── 估算（给 EstimateStage 用） ─────────────────────

export function estimateTaggerCost(
  cards: BookmarkCard[],
  modelName: string,
): { promptTokens: number; outputTokens: number; costCny: number } {
  // 粗估：每条书签 prompt 约 30 字符（id + title + domain）
  const promptText = cards.map((c) => `id=${c.id} | ${c.title} | ${c.url}`).join('\n')
  const promptTokens = estimateTokens(promptText)
  // 输出粗估：每条平均 20 字符（"bookmarkId":"xxx","tags":["a","b","c"]）
  const outputTokens = cards.length * 12
  const costCny = estimateCostCny(modelName, promptTokens, outputTokens)
  return { promptTokens, outputTokens, costCny }
}
