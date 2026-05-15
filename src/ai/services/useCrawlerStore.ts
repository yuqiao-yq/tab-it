import { create } from 'zustand'
import type { CrawlRange } from './crawler'

/**
 * 抓取任务状态机（V2.0 §6.1）
 *
 * 与 useEmbedderStore 同构：idle / running / done / error
 * 进度条显示 done/total + 当前抓取的标题（让用户感知"正在抓什么"）
 */

export type CrawlStage = 'idle' | 'running' | 'done' | 'error'

interface CrawlerStore {
  stage: CrawlStage
  range: CrawlRange
  progress: { done: number; total: number; currentTitle: string }
  lastResult: {
    total: number
    ok: number
    failed: number
  } | null
  errorMessage: string
  abortController: AbortController | null

  setRange: (r: CrawlRange) => void
  start: (controller: AbortController) => void
  setProgress: (done: number, total: number, currentTitle?: string) => void
  finish: (result: CrawlerStore['lastResult']) => void
  fail: (msg: string) => void
  reset: () => void
  cancel: () => void
}

export const useCrawlerStore = create<CrawlerStore>((set, get) => ({
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
