import { cosineSimilarity } from './embedder'
import {
  getEmbeddingsMap,
  type EmbeddingRow,
} from '../../repositories/EmbeddingsDB'
import type { BookmarkCard } from '../../types/bookmark'

/**
 * 整理质检（V2.0 §6.4 重复 / 失效检测）
 *
 * 三类问题：
 * - 🔴 失效：HEAD 请求返回 4xx / 5xx 或网络错
 * - 🟡 疑似重复：
 *   · exact_url：URL 完全一致（同一站点被收藏到多个分类时常见）
 *   · similar_content：URL 不同但 embedding cosine > 0.9（需先生成 embedding）
 * - 🔵 长期未访问：updatedAt < 现在 - 6 个月
 *
 * 实施取舍：
 * - URL 重复 + 长期未访问：纯本地计算，秒级完成
 * - 失效检测：HEAD 请求并发；设默认 5 并发 + 15s 超时；用户可中止
 * - 内容相似：在 EmbeddingsDB 已有的卡片之间做 union-find 簇化；
 *   阈值默认 0.9（保守，避免误判）；只有 §5.1 已生成 embedding 的卡才参与
 *
 * 不放在 OrganizeTab：
 * - OrganizeTab 已有 6 阶段状态机（config/estimate/running/preview/applying/done/error），
 *   再叠加质检 plan 视觉太重；放在 ⚙ 设置作为独立 section，与 Embedding / Crawl /
 *   Summary 一组"管理类工具"对齐，UX 更一致
 */

const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000

// ─── 类型 ────────────────────────────────────────

export type DuplicateKind = 'exact_url' | 'similar_content'

export interface DuplicateGroup {
  /** 稳定标识（用 group 内最小 cardId） */
  groupId: string
  kind: DuplicateKind
  cards: BookmarkCard[]
  /** similar_content 时存最低 pairwise 分数；exact_url 不填 */
  minScore?: number
}

export interface DeadCard {
  card: BookmarkCard
  httpStatus?: number
  error: string
}

export interface QualityReport {
  duplicateGroups: DuplicateGroup[]
  deadCards: DeadCard[]
  staleCards: BookmarkCard[]
  /** scan 元信息 */
  meta: {
    totalCards: number
    /** 跳过未做 HEAD 的（非 http(s)） */
    skippedNonHttp: number
    /** 实际做了 embedding 比对的对数 */
    embeddingPairs: number
    durationMs: number
  }
}

// ─── 选项 ────────────────────────────────────────

export interface ScanQualityOptions {
  cards: BookmarkCard[]
  signal?: AbortSignal
  onProgress?: (phase: ScanPhase, done: number, total: number) => void
  /** 失效检测的 HEAD 并发数；默认 5 */
  concurrency?: number
  /** 单条 HEAD 超时；默认 15000 */
  timeoutMs?: number
  /** 是否做 embedding 内容相似度比对；默认 true（仅当有 embedding row） */
  enableContentSimilarity?: boolean
  /** 内容相似度阈值；默认 0.9 */
  similarityThreshold?: number
}

export type ScanPhase = 'init' | 'duplicate' | 'stale' | 'dead' | 'similar'

// ─── 工具：fetch HEAD with timeout ───────────────

async function checkAlive(
  url: string,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<{ ok: true } | { ok: false; httpStatus?: number; error: string }> {
  const local = new AbortController()
  const timer = setTimeout(() => local.abort(), timeoutMs)
  const onOuter = () => local.abort()
  signal.addEventListener('abort', onOuter)
  try {
    // HEAD 请求；某些服务器不响应 HEAD，先 HEAD 失败再 GET 兜底
    let res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      credentials: 'omit',
      signal: local.signal,
    }).catch(() => null)

    if (!res || res.status === 405 || res.status === 501) {
      // HEAD 不被支持 → 用 GET 但只读 headers
      res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        credentials: 'omit',
        signal: local.signal,
      }).catch(() => null)
    }
    if (!res) {
      return { ok: false, error: '网络错误 / 无响应' }
    }
    if (res.ok) return { ok: true }
    return {
      ok: false,
      httpStatus: res.status,
      error: `HTTP ${res.status}: ${res.statusText || '失败'}`,
    }
  } catch (err) {
    if (local.signal.aborted) {
      return { ok: false, error: signal.aborted ? '已取消' : '超时' }
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : '未知错误',
    }
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', onOuter)
  }
}

// ─── 主流程：scanQuality ─────────────────────────

export async function scanQuality(
  opts: ScanQualityOptions,
): Promise<QualityReport> {
  const t0 = Date.now()
  const signal = opts.signal ?? new AbortController().signal
  const concurrency = Math.max(1, Math.min(8, opts.concurrency ?? 5))
  const timeoutMs = opts.timeoutMs ?? 15_000
  const simEnable = opts.enableContentSimilarity ?? true
  const simThreshold = opts.similarityThreshold ?? 0.9

  const cards = opts.cards
  opts.onProgress?.('init', 0, 1)

  // ─── ① URL 完全重复 ───
  opts.onProgress?.('duplicate', 0, 1)
  const byUrl = new Map<string, BookmarkCard[]>()
  for (const c of cards) {
    const k = (c.url || '').trim().toLowerCase()
    if (!k) continue
    const arr = byUrl.get(k) ?? []
    arr.push(c)
    byUrl.set(k, arr)
  }
  const duplicateGroups: DuplicateGroup[] = []
  for (const [, group] of byUrl) {
    if (group.length < 2) continue
    const sorted = [...group].sort((a, b) => a.id.localeCompare(b.id))
    duplicateGroups.push({
      groupId: `exact:${sorted[0].id}`,
      kind: 'exact_url',
      cards: sorted,
    })
  }
  opts.onProgress?.('duplicate', 1, 1)

  // ─── ② 长期未访问（updatedAt < now-6mo） ───
  opts.onProgress?.('stale', 0, 1)
  const cutoff = Date.now() - SIX_MONTHS_MS
  const staleCards = cards.filter((c) => c.updatedAt < cutoff)
  opts.onProgress?.('stale', 1, 1)

  // ─── ③ 失效检测：HEAD ───
  // 仅对 http(s) 卡片做 HEAD；非 http 跳过（chrome:// 等）
  const httpCards = cards.filter((c) => /^https?:\/\//i.test(c.url))
  const skippedNonHttp = cards.length - httpCards.length

  const deadCards: DeadCard[] = []
  // 注意：失效卡只取每个 unique url 的第一个，避免对同一站点重复 HEAD（已被 §1 视为重复）
  const seenUrl = new Set<string>()
  const probeQueue: BookmarkCard[] = []
  for (const c of httpCards) {
    const k = c.url.trim().toLowerCase()
    if (seenUrl.has(k)) continue
    seenUrl.add(k)
    probeQueue.push(c)
  }
  const totalProbe = probeQueue.length
  let doneProbe = 0
  opts.onProgress?.('dead', 0, totalProbe)

  const worker = async () => {
    while (probeQueue.length > 0) {
      if (signal.aborted) return
      const card = probeQueue.shift()
      if (!card) return
      const r = await checkAlive(card.url, signal, timeoutMs)
      if (!r.ok) {
        // 把所有 url 相同的卡都标失效（一起处理 ）
        const matches = httpCards.filter(
          (x) => x.url.trim().toLowerCase() === card.url.trim().toLowerCase(),
        )
        for (const m of matches) {
          deadCards.push({
            card: m,
            httpStatus: r.httpStatus,
            error: r.error,
          })
        }
      }
      doneProbe++
      opts.onProgress?.('dead', doneProbe, totalProbe)
    }
  }
  const workers: Promise<void>[] = []
  for (let i = 0; i < concurrency; i++) workers.push(worker())
  await Promise.all(workers)

  // ─── ④ 内容相似度（embedding pairwise + union-find） ───
  let embeddingPairs = 0
  if (simEnable) {
    opts.onProgress?.('similar', 0, 1)
    const ids = cards.map((c) => c.id)
    const map = await getEmbeddingsMap(ids)
    const rowsList: { card: BookmarkCard; row: EmbeddingRow }[] = []
    for (const c of cards) {
      const row = map.get(c.id)
      if (row && row.vector.length > 0) rowsList.push({ card: c, row })
    }
    // 排除 exact_url 已经覆盖的（避免重复出现在两组里）
    const exactDupCardIds = new Set(
      duplicateGroups.flatMap((g) => g.cards.map((c) => c.id)),
    )
    const candidates = rowsList.filter(
      (x) => !exactDupCardIds.has(x.card.id),
    )

    // union-find
    const parent = new Map<string, string>()
    const minScoreMap = new Map<string, number>()
    const find = (x: string): string => {
      let cur = x
      while (parent.get(cur) !== cur) {
        const p = parent.get(cur)!
        parent.set(cur, parent.get(p)!) // 路径压缩
        cur = parent.get(cur)!
      }
      return cur
    }
    const union = (a: string, b: string, score: number) => {
      const ra = find(a)
      const rb = find(b)
      if (ra === rb) {
        const cur = minScoreMap.get(ra) ?? 1
        minScoreMap.set(ra, Math.min(cur, score))
        return
      }
      // 合并到 id 较小的根
      const root = ra < rb ? ra : rb
      const merged = ra < rb ? rb : ra
      parent.set(merged, root)
      const cur = Math.min(
        minScoreMap.get(ra) ?? 1,
        minScoreMap.get(rb) ?? 1,
        score,
      )
      minScoreMap.set(root, cur)
    }
    for (const x of candidates) parent.set(x.card.id, x.card.id)

    // 三角对比（i < j），O(n^2/2)；千卡 ~50 万次浮点
    for (let i = 0; i < candidates.length; i++) {
      if (signal.aborted) break
      for (let j = i + 1; j < candidates.length; j++) {
        embeddingPairs++
        const score = cosineSimilarity(candidates[i].row.vector, candidates[j].row.vector)
        if (score >= simThreshold) {
          union(candidates[i].card.id, candidates[j].card.id, score)
        }
      }
    }

    // 收集簇
    const clusters = new Map<string, BookmarkCard[]>()
    for (const x of candidates) {
      const root = find(x.card.id)
      const arr = clusters.get(root) ?? []
      arr.push(x.card)
      clusters.set(root, arr)
    }
    for (const [root, group] of clusters) {
      if (group.length < 2) continue
      const sorted = [...group].sort((a, b) => a.id.localeCompare(b.id))
      duplicateGroups.push({
        groupId: `sim:${root}`,
        kind: 'similar_content',
        cards: sorted,
        minScore: minScoreMap.get(root),
      })
    }
    opts.onProgress?.('similar', 1, 1)
  }

  return {
    duplicateGroups,
    deadCards,
    staleCards,
    meta: {
      totalCards: cards.length,
      skippedNonHttp,
      embeddingPairs,
      durationMs: Date.now() - t0,
    },
  }
}
