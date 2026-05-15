import type { AISettings } from '../types'
import { searchByEmbedding } from './embedder'
import { getPageContentsMap } from '../../repositories/PageContentsDB'
import type { BookmarkCard } from '../../types/bookmark'

/**
 * RAG 检索（V2.0 §6.2 RAG 问答）
 *
 * 设计取舍：
 * - 不做 chunk 切分：复用 §5.1 的 card-level embedding（已升级为
 *   "title+domain+tags+description+正文 8000字" 拼接），单文档作为最小检索单元
 *   → 简单、避免新建 chunks 表；对 8000 字以下的 page 召回质量已够用
 * - 不做 LLM rerank（文档说"可选，先用简单 top-K"）：余弦 top K + minScore 过滤即可
 * - 没抓正文的卡片仍可被命中（基于 title/tags 的 embedding），但 context 只放正文摘录
 * - 完全没 embedding 时返回空数组，调用方走"无 RAG"分支
 */

export interface RetrievedDoc {
  card: BookmarkCard
  /** 0..1 余弦相似度 */
  score: number
  /** 该卡 page content 截断后的片段；没抓正文则为 undefined */
  excerpt?: string
}

export interface RetrieveContextOptions {
  query: string
  cards: BookmarkCard[]
  settings: AISettings
  /** 默认 8；超过 10 容易把 prompt 撑得过大 */
  topK?: number
  /** 默认 0.25；低于此分数视为不相关，丢弃 */
  minScore?: number
  /** 单条 excerpt 截断字数；默认 1500，给 prompt 留余地 */
  excerptChars?: number
  signal?: AbortSignal
}

export async function retrieveContext(
  opts: RetrieveContextOptions,
): Promise<RetrievedDoc[]> {
  const topK = opts.topK ?? 8
  const minScore = opts.minScore ?? 0.25
  const excerptChars = opts.excerptChars ?? 1500

  const hits = await searchByEmbedding({
    query: opts.query,
    cards: opts.cards,
    settings: opts.settings,
    topK,
    minScore,
    signal: opts.signal,
  })
  if (hits.length === 0) return []

  // 拉对应 cards 的正文（§6.1 已抓）
  const cardMap = new Map(opts.cards.map((c) => [c.id, c]))
  const pageMap = await getPageContentsMap(hits.map((h) => h.cardId))

  const docs: RetrievedDoc[] = []
  for (const h of hits) {
    const card = cardMap.get(h.cardId)
    if (!card) continue
    const page = pageMap.get(h.cardId)
    const excerpt =
      page?.status === 'ok' && page.content
        ? page.content.slice(0, excerptChars)
        : undefined
    docs.push({ card, score: h.score, excerpt })
  }
  return docs
}

/**
 * 把检索到的文档拼成 RAG system prompt。
 *
 * 引用规范：每条以 `[N]` 开头编号；要求模型在回答末尾用 `[1] [2]` 引用对应来源。
 * 若没拿到正文（仅 title+tags embedding 命中），仍然列出来源（带「(正文未索引)」标注），
 * 让用户知道这条相关但缺正文 → 引导他去 §6.1 抓取。
 *
 * 字数控制：每条 excerpt 默认 1500 字，topK=8 → 12000 字 ≈ 6000 tokens；
 * 加 query + system 指令大约 7000 tokens，留出 1000 给 user 多轮对话。
 */
export function buildRagSystemPrompt(docs: RetrievedDoc[]): string {
  if (docs.length === 0) {
    return [
      '你是用户的私人书签知识库助手。',
      '当前问题没有从用户的本地索引中召回任何相关内容。',
      '请基于通用知识尝试回答；同时在回答末尾提示用户：',
      '"我的书签库里没找到相关内容，以上回答不来自您的收藏，仅供参考。"',
    ].join('\n')
  }

  const sources = docs
    .map((d, i) => {
      const idx = i + 1
      let domain = ''
      try {
        domain = new URL(d.card.url).hostname.replace(/^www\./, '')
      } catch {
        /* ignore */
      }
      const header = `[${idx}] ${d.card.title} (${domain})`
      const body = d.excerpt
        ? d.excerpt
        : '(正文未索引；以上仅是命中标题/标签的弱匹配)'
      return `${header}\n${body}`
    })
    .join('\n\n---\n\n')

  return [
    '你是用户的私人书签知识库助手。回答用户问题时，必须基于以下提供的内容片段，',
    '并在答案中以 [1] [2] 等标号引用对应的来源。',
    '',
    '约束：',
    '1. 如果片段中没有相关信息，明确说"我的书签库里没找到相关内容"',
    '2. 引用必须准确（标号对应片段顺序）',
    '3. 简洁回答，避免冗余',
    '4. 不要复述片段原文，要总结、对比、提炼',
    '',
    '来源片段：',
    sources,
  ].join('\n')
}
