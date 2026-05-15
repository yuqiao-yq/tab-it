import { create } from 'zustand'
import type { QualityReport, ScanPhase } from './quality'

/**
 * 整理质检状态机（V2.0 §6.4）
 *
 * 阶段：
 *   idle → scanning → preview → applying → done / error
 *   - scanning：扫描中（4 个 sub-phase：duplicate/stale/dead/similar）
 *   - preview：用户在三色列表中勾选要处理的卡片
 *   - applying：批量执行（删除 / 移动到归档分类）
 */

export type QualityStage =
  | 'idle'
  | 'scanning'
  | 'preview'
  | 'applying'
  | 'done'
  | 'error'

interface QualityStore {
  stage: QualityStage
  /** scan 期间的子阶段 */
  scanPhase: ScanPhase
  scanProgress: { done: number; total: number }
  report: QualityReport | null
  errorMessage: string
  abortController: AbortController | null

  /** 用户勾选要处理的 cardId 集合 */
  selected: Set<string>

  startScan: (controller: AbortController) => void
  setScanProgress: (phase: ScanPhase, done: number, total: number) => void
  goPreview: (report: QualityReport) => void
  goApplying: () => void
  goDone: () => void
  goError: (msg: string) => void
  reset: () => void
  cancel: () => void

  // ─── selection ───
  toggleSelect: (cardId: string) => void
  selectAll: (cardIds: string[]) => void
  clearSelection: () => void
}

export const useQualityStore = create<QualityStore>((set, get) => ({
  stage: 'idle',
  scanPhase: 'init',
  scanProgress: { done: 0, total: 0 },
  report: null,
  errorMessage: '',
  abortController: null,
  selected: new Set(),

  startScan(controller) {
    set({
      stage: 'scanning',
      abortController: controller,
      scanPhase: 'init',
      scanProgress: { done: 0, total: 0 },
      report: null,
      errorMessage: '',
      selected: new Set(),
    })
  },
  setScanProgress(phase, done, total) {
    set({ scanPhase: phase, scanProgress: { done, total } })
  },
  goPreview(report) {
    set({ stage: 'preview', report, abortController: null })
  },
  goApplying() {
    set({ stage: 'applying' })
  },
  goDone() {
    set({ stage: 'done' })
  },
  goError(msg) {
    set({ stage: 'error', errorMessage: msg, abortController: null })
  },
  reset() {
    set({
      stage: 'idle',
      scanPhase: 'init',
      scanProgress: { done: 0, total: 0 },
      report: null,
      errorMessage: '',
      abortController: null,
      selected: new Set(),
    })
  },
  cancel() {
    const c = get().abortController
    if (c) c.abort()
    set({ abortController: null, stage: 'idle' })
  },

  toggleSelect(cardId) {
    set((s) => {
      const next = new Set(s.selected)
      next.has(cardId) ? next.delete(cardId) : next.add(cardId)
      return { selected: next }
    })
  },
  selectAll(cardIds) {
    set({ selected: new Set(cardIds) })
  },
  clearSelection() {
    set({ selected: new Set() })
  },
}))
