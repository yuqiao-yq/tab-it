import { create } from 'zustand'
import type {
  OrganizePlan,
  OrganizeRange,
  OrganizeStage,
  OrganizeStyle,
  PlanReview,
} from '../types'
import { makeAcceptAllReview } from './plan'

/**
 * AI 整理 Tab 的状态机
 *
 * 一个 Tab 实例对应一个 store？这里先用全局单例（V1 一个浮窗只能开一个整理任务）。
 * V3 多浮窗支持时再改为 per-tab 实例。
 *
 * 注意：plan 和 review 都不持久化（每次刷新页面都从头开始）；
 * 只持久化"上次的 range/style 偏好"以便用户重复整理时减少重新选择的成本。
 */

interface OrganizeStore {
  stage: OrganizeStage
  /** 用户配置 */
  range: OrganizeRange
  style: OrganizeStyle
  /** 处理进度 */
  progress: { done: number; total: number }
  /** 当前 plan（preview/applying/done 阶段有效） */
  plan: OrganizePlan | null
  /** 用户对 plan 的接受/拒绝 */
  review: PlanReview
  /** 错误信息（仅 stage='error' 时有效） */
  errorMessage: string
  /** AI 调用 abortController（运行中可取消） */
  abortController: AbortController | null

  // ─── actions ─────────────────────────────────────
  setRange: (r: OrganizeRange) => void
  setStyle: (s: OrganizeStyle) => void
  goEstimate: () => void
  goRunning: (controller: AbortController) => void
  setProgress: (done: number, total: number) => void
  goPreview: (plan: OrganizePlan) => void
  goApplying: () => void
  goDone: () => void
  goError: (message: string) => void
  reset: () => void
  cancel: () => void

  // ─── review 操作 ──────────────────────────────────
  toggleNewCategory: (tempId: string) => void
  toggleAssignment: (index: number) => void
  toggleDeletion: (categoryId: string) => void
  acceptAll: () => void
}

const INITIAL_REVIEW: PlanReview = {
  acceptedNewCategoryTempIds: new Set(),
  acceptedAssignments: new Set(),
  acceptedDeletions: new Set(),
}

export const useOrganizeStore = create<OrganizeStore>((set, get) => ({
  stage: 'config',
  range: { type: 'all' },
  style: 'free',
  progress: { done: 0, total: 0 },
  plan: null,
  review: INITIAL_REVIEW,
  errorMessage: '',
  abortController: null,

  setRange(r) {
    set({ range: r })
  },
  setStyle(s) {
    set({ style: s })
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
      review: makeAcceptAllReview(plan),
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

  // ─── review ──────────────────────────────────────
  toggleNewCategory(tempId) {
    set((s) => {
      const next = new Set(s.review.acceptedNewCategoryTempIds)
      next.has(tempId) ? next.delete(tempId) : next.add(tempId)
      return { review: { ...s.review, acceptedNewCategoryTempIds: next } }
    })
  },
  toggleAssignment(index) {
    set((s) => {
      const next = new Set(s.review.acceptedAssignments)
      next.has(index) ? next.delete(index) : next.add(index)
      return { review: { ...s.review, acceptedAssignments: next } }
    })
  },
  toggleDeletion(categoryId) {
    set((s) => {
      const next = new Set(s.review.acceptedDeletions)
      next.has(categoryId) ? next.delete(categoryId) : next.add(categoryId)
      return { review: { ...s.review, acceptedDeletions: next } }
    })
  },
  acceptAll() {
    const plan = get().plan
    if (plan) set({ review: makeAcceptAllReview(plan) })
  },
}))
