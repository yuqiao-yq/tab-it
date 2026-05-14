import { v4 as uuid } from 'uuid'
import type {
  AISettings,
  BookmarkAssignment,
  ChatMessage,
  NewCategoryProposal,
  OrganizePlan,
  OrganizeRange,
  OrganizeStyle,
} from '../types'
import { ORGANIZE_STYLE_LABEL } from '../types'
import { getProviderFor } from '../manager'
import type { BookmarkCard, Category } from '../../types/bookmark'

/**
 * AI 整理书签 service
 *
 * 输入：所有 categories + cards + range（整理范围） + style（风格倾向）
 * 输出：OrganizePlan（包含新建分类、书签归属、删除空分类）
 *
 * 关键设计：
 * - 数据切片：发送给 LLM 的只有 id + title（截断 80 字符）+ domain（不发完整 URL）
 *             这样既减少 tokens 又保护用户隐私
 * - 分批：每批 100 条书签调一次 API；多批之间通过 prompt 传上一批的 newCategories
 *         作为参考，让分类树趋向统一
 * - JSON Schema 强约束 + 防御性解析：异常时 fallback 到"该批次跳过"
 */

// ─── 数据切片 ────────────────────────────────────────

interface BookmarkSlice {
  id: string
  title: string
  domain: string
}

function sliceBookmark(c: BookmarkCard, anonymousMode: boolean): BookmarkSlice {
  // domain 提取：URL 解析失败时直接用空串，避免抛错
  let domain = ''
  try {
    domain = new URL(c.url).hostname.replace(/^www\./, '')
  } catch {
    /* ignore */
  }
  // anonymousMode=false 时也只发 domain，不发完整 URL —— 这条是产品红线
  // （未来如果需要"完整模式"再扩展此参数）
  void anonymousMode
  return {
    id: c.id,
    title: (c.title || '(无标题)').slice(0, 80),
    domain: domain || '(unknown)',
  }
}

// ─── 范围 → 待处理书签 ─────────────────────────────────

export function selectBookmarks(
  range: OrganizeRange,
  cards: BookmarkCard[],
  categories: Category[],
): BookmarkCard[] {
  switch (range.type) {
    case 'all':
      return cards
    case 'category': {
      const targetIds = collectDescendantIds([range.id], categories)
      return cards.filter((c) => targetIds.has(c.categoryId))
    }
    case 'uncategorized': {
      // "未分类" = 顶层散落项 = 卡片所属分类是顶层（没有 parentId）的
      const topLevelIds = new Set(
        categories.filter((c) => !c.parentId).map((c) => c.id),
      )
      return cards.filter((c) => topLevelIds.has(c.categoryId))
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

// ─── Token / 成本估算（粗略） ──────────────────────────

/**
 * 粗略 token 估算：1 token ≈ 0.75 个中文字符 / 4 个英文字符
 * 这里直接按字符数 / 2 估算（中英混合的偏保守口径）
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 2)
}

/** 模型价格表（CNY per 1M tokens；硬编码常见 + 兜底） */
const MODEL_PRICE_CNY: Record<string, { in: number; out: number }> = {
  'deepseek-chat': { in: 1, out: 2 },
  'deepseek-reasoner': { in: 4, out: 16 },
  'gpt-4o-mini': { in: 1.1, out: 4.4 },
  'gpt-4o': { in: 18, out: 72 },
  'glm-4-flash': { in: 0, out: 0 },
  'moonshot-v1-8k': { in: 12, out: 12 },
}

export function estimateCostCny(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const p = MODEL_PRICE_CNY[model] ?? { in: 5, out: 15 } // 未知模型按中等价位
  return (
    (promptTokens / 1_000_000) * p.in + (completionTokens / 1_000_000) * p.out
  )
}

// ─── Prompt 构造 ────────────────────────────────────

const BATCH_SIZE = 100
const MAX_OUTPUT_TOKENS_PER_BATCH = 3000

interface BuildPromptInput {
  bookmarks: BookmarkSlice[]
  existingCategoryNames: string[]
  /** 上一批已经新建的分类（让多批结果趋向收敛） */
  carriedNewCategories: NewCategoryProposal[]
  style: OrganizeStyle
}

function buildPrompt(input: BuildPromptInput): ChatMessage[] {
  const styleHint = ORGANIZE_STYLE_LABEL[input.style]

  const system = `你是一个浏览器书签整理助手。用户会发给你一组书签（id/title/domain），
你需要按内容主题为它们提议新的分类结构。

约束：
1. 输出必须是合法 JSON，符合给定 Schema，不能有任何额外文本
2. 新分类名简洁（≤6 字），优先复用已有分类
3. 单个分类至少 3 条；少于 3 条的归到「杂项」
4. 保持 bookmark id 不变；不要发明新的书签
5. 整理风格：${styleHint}

返回 JSON Schema：
{
  "newCategories": [
    { "tempId": "tmp_1", "name": "前端开发", "icon": "💻", "rationale": "包含 React/Vue/Webpack 相关学习与文档" }
  ],
  "assignments": [
    { "bookmarkId": "bk_xxx", "targetTempId": "tmp_1" }
  ]
}

assignments 中：
- 若归到本次新建的分类，用 targetTempId
- 若归到现有分类，用 targetCategoryName（写已有分类的名称，由前端二次解析）
- 同一 bookmark 在 assignments 中只能出现一次

如果某条书签找不到合适分类，仍要给它一个 assignment（归到「杂项」即可，先创建一个 tempId 为 tmp_misc 的分类）。`

  const userParts: string[] = []
  if (input.existingCategoryNames.length > 0) {
    userParts.push(
      '现有分类（如有合适请优先复用其名）：\n' +
        input.existingCategoryNames.map((n) => `- ${n}`).join('\n'),
    )
  }
  if (input.carriedNewCategories.length > 0) {
    userParts.push(
      '上一批已经创建的新分类（保持一致性，不要重复）：\n' +
        input.carriedNewCategories
          .map((c) => `- ${c.name} (tempId=${c.tempId})`)
          .join('\n'),
    )
  }
  userParts.push(
    `待整理书签（共 ${input.bookmarks.length} 条）：\n` +
      input.bookmarks
        .map((b) => `- id=${b.id} | ${b.title} | ${b.domain}`)
        .join('\n'),
  )

  return [
    { role: 'system', content: system },
    { role: 'user', content: userParts.join('\n\n') },
  ]
}

// ─── 防御性 JSON 解析 ───────────────────────────────

interface RawAIBatch {
  newCategories?: Array<{
    tempId?: string
    name?: string
    icon?: string
    rationale?: string
  }>
  assignments?: Array<{
    bookmarkId?: string
    targetTempId?: string
    targetCategoryName?: string
  }>
}

function parseAIResponse(text: string): RawAIBatch {
  // LLM 偶尔会包 ```json ... ``` 或加前后说明，先尝试提取 JSON 主体
  const trimmed = text.trim()
  const jsonStr = extractJson(trimmed)
  try {
    return JSON.parse(jsonStr) as RawAIBatch
  } catch {
    return { newCategories: [], assignments: [] }
  }
}

function extractJson(text: string): string {
  // 优先匹配 ```json ... ``` 块
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(text)
  if (fence) return fence[1].trim()
  // 退化：找第一个 { 到最后一个 }
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) return text.slice(start, end + 1)
  return text
}

// ─── 核心：runOrganize ──────────────────────────────

export interface RunOrganizeOptions {
  range: OrganizeRange
  style: OrganizeStyle
  cards: BookmarkCard[]
  categories: Category[]
  settings: AISettings
  /** 中止信号 */
  signal?: AbortSignal
  /** 进度回调：currentBatch / totalBatches */
  onProgress?: (done: number, total: number) => void
}

export async function runOrganize(
  opts: RunOrganizeOptions,
): Promise<OrganizePlan> {
  const provider = getProviderFor('organize', opts.settings)
  if (!provider) {
    throw new Error('未配置可用的整理 Provider，请先去「⚙ 设置」添加')
  }

  const targetCards = selectBookmarks(opts.range, opts.cards, opts.categories)
  if (targetCards.length === 0) {
    throw new Error('选定范围内没有可整理的书签')
  }

  const slices = targetCards.map((c) =>
    sliceBookmark(c, opts.settings.privacy.anonymousMode),
  )
  const existingCategoryNames = Array.from(
    new Set(opts.categories.map((c) => c.name)),
  )
  const existingCategoryByName = new Map(
    opts.categories.map((c) => [c.name, c.id]),
  )

  // 分批
  const batches: BookmarkSlice[][] = []
  for (let i = 0; i < slices.length; i += BATCH_SIZE) {
    batches.push(slices.slice(i, i + BATCH_SIZE))
  }

  let carriedNewCategories: NewCategoryProposal[] = []
  const allAssignments: BookmarkAssignment[] = []
  let totalPromptTokens = 0
  let totalCompletionTokens = 0
  let modelUsed = ''

  // bookmarkId → 当前所属 category id 快查
  const cardCatIdMap = new Map(opts.cards.map((c) => [c.id, c.categoryId]))

  for (let b = 0; b < batches.length; b++) {
    if (opts.signal?.aborted) {
      throw new Error('用户已取消')
    }
    const batch = batches[b]
    const messages = buildPrompt({
      bookmarks: batch,
      existingCategoryNames,
      carriedNewCategories,
      style: opts.style,
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

    // 合并新分类（按 tempId 去重，复用 carried）
    const tempIdMap = new Map<string, NewCategoryProposal>(
      carriedNewCategories.map((c) => [c.tempId, c]),
    )
    for (const cat of raw.newCategories ?? []) {
      if (!cat.name?.trim()) continue
      const tempId = cat.tempId?.trim() || `tmp_${uuid().slice(0, 8)}`
      // 已存在同 tempId → 跳过；同名 → 也复用首个
      const sameName = Array.from(tempIdMap.values()).find(
        (x) => x.name === cat.name,
      )
      if (sameName) continue
      if (tempIdMap.has(tempId)) continue
      tempIdMap.set(tempId, {
        tempId,
        name: cat.name.trim().slice(0, 12),
        icon: cat.icon?.trim() || undefined,
        rationale: cat.rationale?.trim() || undefined,
      })
    }
    carriedNewCategories = Array.from(tempIdMap.values())

    // 收集 assignments；过滤无效 bookmarkId
    const batchIds = new Set(batch.map((b) => b.id))
    for (const asn of raw.assignments ?? []) {
      const bid = asn.bookmarkId?.trim()
      if (!bid || !batchIds.has(bid)) continue

      // 解析目标
      const targetTempId = asn.targetTempId?.trim()
      const targetCategoryName = asn.targetCategoryName?.trim()
      let resolvedTempId: string | undefined
      let resolvedCategoryId: string | undefined

      if (targetTempId && tempIdMap.has(targetTempId)) {
        resolvedTempId = targetTempId
      } else if (targetCategoryName) {
        const existingId = existingCategoryByName.get(targetCategoryName)
        if (existingId) {
          resolvedCategoryId = existingId
        } else {
          // AI 给了一个新分类名但没在 newCategories 中声明 → 自动创建一个
          const tempId = `tmp_${uuid().slice(0, 8)}`
          tempIdMap.set(tempId, {
            tempId,
            name: targetCategoryName.slice(0, 12),
          })
          carriedNewCategories = Array.from(tempIdMap.values())
          resolvedTempId = tempId
        }
      }

      if (!resolvedTempId && !resolvedCategoryId) continue

      // 跳过"目标 = 当前所在分类"的 no-op
      const fromCategoryId = cardCatIdMap.get(bid) ?? null
      if (resolvedCategoryId && resolvedCategoryId === fromCategoryId) continue

      allAssignments.push({
        bookmarkId: bid,
        fromCategoryId,
        targetTempId: resolvedTempId,
        targetCategoryId: resolvedCategoryId,
      })
    }

    opts.onProgress?.(b + 1, batches.length)
  }

  // 计算建议删除的空分类：
  // 仅当某分类的所有书签都被移走 + 它本身是被整理范围所覆盖的"叶子分类"时建议删
  const movingOutCount = new Map<string, number>()
  for (const a of allAssignments) {
    if (a.fromCategoryId) {
      movingOutCount.set(
        a.fromCategoryId,
        (movingOutCount.get(a.fromCategoryId) ?? 0) + 1,
      )
    }
  }
  const directCardCount = new Map<string, number>()
  for (const c of opts.cards) {
    directCardCount.set(c.categoryId, (directCardCount.get(c.categoryId) ?? 0) + 1)
  }
  const childCount = new Map<string, number>()
  for (const c of opts.categories) {
    if (c.parentId) {
      childCount.set(c.parentId, (childCount.get(c.parentId) ?? 0) + 1)
    }
  }
  const deletions: string[] = []
  for (const cat of opts.categories) {
    const direct = directCardCount.get(cat.id) ?? 0
    const moving = movingOutCount.get(cat.id) ?? 0
    const hasChild = (childCount.get(cat.id) ?? 0) > 0
    if (!hasChild && direct > 0 && moving >= direct) {
      deletions.push(cat.id)
    }
  }

  return {
    id: uuid(),
    createdAt: Date.now(),
    range: opts.range,
    style: opts.style,
    newCategories: carriedNewCategories,
    assignments: allAssignments,
    deletions,
    meta: {
      provider: provider.id,
      model: modelUsed,
      promptTokens: totalPromptTokens,
      completionTokens: totalCompletionTokens,
      estimatedCostCny: estimateCostCny(
        modelUsed,
        totalPromptTokens,
        totalCompletionTokens,
      ),
    },
  }
}
