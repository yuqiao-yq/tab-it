import { create } from 'zustand'
import type { TagPlan, TagRange, TagPlanReview, TagStage } from '../types'

/**
 * Tagger Tab 的状态机
 *
 * 与 useOrganizeStore 同构：config → estimate → running → preview → applying → done / error
 *
 * 设计取舍：
 * - 同 organize 一样，全局单例（V1 浮窗内一次只跑一个 tagger 任务）
 * - plan / review 不持久化（每次刷新页面都从头开始；taggable 列表本来也会变化）
 * - 仅持久化「上次选择的 range 偏好」？V1 不做，下次再加，简化
 */

interface TaggerStore {
  stage: TagStage
  range: TagRange
  progress: { done: number; total: number }
  plan: TagPlan | null
  review: TagPlanReview
  errorMessage: string
  abortController: AbortController | null

  // ─── 状态机迁移 ───
  setRange: (r: TagRange) => void
  goEstimate: () => void
  goRunning: (controller: AbortController) => void
  setProgress: (done: number, total: number) => void
  goPreview: (plan: TagPlan) => void
  goApplying: () => void
  goDone: () => void
  goError: (message: string) => void
  reset: () => void
  cancel: () => void

  // ─── review 操作 ───
  /** 切换某条建议的「接受」状态 */
  toggleAccept: (bookmarkId: string) => void
  /** 全选 */
  acceptAll: () => void
  /** 全部拒绝 */
  rejectAll: () => void
  /** 用户编辑了某条的 tags（替换式） */
  editTags: (bookmarkId: string, tags: string[]) => void
  /** 取消编辑某条（回退到 newTags） */
  resetEdit: (bookmarkId: string) => void
}

const INITIAL_REVIEW: TagPlanReview = {
  accepted: new Set(),
  edits: new Map(),
}

export const useTaggerStore = create<TaggerStore>((set, get) => ({
  stage: 'config',
  range: { type: 'untagged' },
  progress: { done: 0, total: 0 },
  plan: null,
  review: INITIAL_REVIEW,
  errorMessage: '',
  abortController: null,

  setRange(r) {
    set({ range: r })
  },
  goEstimate() {
    set({ stage: 'estimate' })
  },
  goRunning(controller) {
    set({
      stage: 'running',
      abortController: controller,
      progress: { done: 0, total: 0 },
    })
  },
  setProgress(done, total) {
    set({ progress: { done, total } })
  },
  goPreview(plan) {
    set({
      stage: 'preview',
      plan,
      // 默认全部接受
      review: {
        accepted: new Set(plan.suggestions.map((s) => s.bookmarkId)),
        edits: new Map(),
      },
      abortController: null,
    })
  },
  goApplying() {
    set({ stage: 'applying' })
  },
  goDone() {
    set({ stage: 'done' })
  },
  goError(message) {
    set({ stage: 'error', errorMessage: message, abortController: null })
  },
  reset() {
    set({
      stage: 'config',
      progress: { done: 0, total: 0 },
      plan: null,
      review: INITIAL_REVIEW,
      errorMessage: '',
      abortController: null,
    })
  },
  cancel() {
    const c = get().abortController
    if (c) c.abort()
    set({ abortController: null, stage: 'config' })
  },

  toggleAccept(bookmarkId) {
    set((s) => {
      const next = new Set(s.review.accepted)
      next.has(bookmarkId) ? next.delete(bookmarkId) : next.add(bookmarkId)
      return { review: { ...s.review, accepted: next } }
    })
  },
  acceptAll() {
    const plan = get().plan
    if (!plan) return
    set((s) => ({
      review: {
        ...s.review,
        accepted: new Set(plan.suggestions.map((x) => x.bookmarkId)),
      },
    }))
  },
  rejectAll() {
    set((s) => ({
      review: { ...s.review, accepted: new Set() },
    }))
  },
  editTags(bookmarkId, tags) {
    set((s) => {
      const nextEdits = new Map(s.review.edits)
      nextEdits.set(bookmarkId, tags)
      // 编辑过的项默认就是「接受」状态，避免用户改了 tags 但忘了勾选导致白改
      const nextAccepted = new Set(s.review.accepted)
      nextAccepted.add(bookmarkId)
      return {
        review: {
          ...s.review,
          edits: nextEdits,
          accepted: nextAccepted,
        },
      }
    })
  },
  resetEdit(bookmarkId) {
    set((s) => {
      const nextEdits = new Map(s.review.edits)
      nextEdits.delete(bookmarkId)
      return { review: { ...s.review, edits: nextEdits } }
    })
  },
}))

/**
 * 把 review 套到 plan 上，得到「最终要写库的 entries」。
 * 给应用阶段用。
 */
export function resolveFinalEntries(
  plan: TagPlan,
  review: TagPlanReview,
): Array<{ cardId: string; tags: string[] }> {
  const out: Array<{ cardId: string; tags: string[] }> = []
  for (const s of plan.suggestions) {
    if (!review.accepted.has(s.bookmarkId)) continue
    const tags = review.edits.get(s.bookmarkId) ?? s.newTags
    out.push({ cardId: s.bookmarkId, tags })
  }
  return out
}
