import { create } from 'zustand'
import type { SummaryRange } from './summarizer'

/**
 * AI 自动备注状态机（V2.0 §6.3）—— 与 useCrawlerStore 同构
 */

export type SummarizeStage = 'idle' | 'running' | 'done' | 'error'

interface SummarizerStore {
  stage: SummarizeStage
  range: SummaryRange
  progress: { done: number; total: number; currentTitle: string }
  lastResult: { total: number; ok: number; failed: number } | null
  errorMessage: string
  abortController: AbortController | null

  setRange: (r: SummaryRange) => void
  start: (controller: AbortController) => void
  setProgress: (done: number, total: number, currentTitle?: string) => void
  finish: (result: SummarizerStore['lastResult']) => void
  fail: (msg: string) => void
  reset: () => void
  cancel: () => void
}

export const useSummarizerStore = create<SummarizerStore>((set, get) => ({
  stage: 'idle',
  range: { type: 'untouched' },
  progress: { done: 0, total: 0, currentTitle: '' },
  lastResult: null,
  errorMessage: '',
  abortController: null,

  setRange(r) {
    set({ range: r })
  },
  start(controller) {
    set({
      stage: 'running',
      abortController: controller,
      progress: { done: 0, total: 0, currentTitle: '' },
      errorMessage: '',
    })
  },
  setProgress(done, total, currentTitle) {
    set({
      progress: {
        done,
        total,
        currentTitle: currentTitle ?? get().progress.currentTitle,
      },
    })
  },
  finish(result) {
    set({ stage: 'done', lastResult: result, abortController: null })
  },
  fail(msg) {
    set({ stage: 'error', errorMessage: msg, abortController: null })
  },
  reset() {
    set({
      stage: 'idle',
      progress: { done: 0, total: 0, currentTitle: '' },
      errorMessage: '',
      abortController: null,
    })
  },
  cancel() {
    const c = get().abortController
    if (c) c.abort()
    set({ abortController: null, stage: 'idle' })
  },
}))
