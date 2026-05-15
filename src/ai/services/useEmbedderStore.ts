import { create } from 'zustand'

/**
 * Embedding 生成任务状态机（V1.5 §5.1）
 *
 * 比 organizer / tagger 简洁很多：embedding 没有"用户预览 + 接受/拒绝"环节，
 * 一旦确认生成就直接落库，不需要 review 步骤。
 *
 * 也不持久化阶段：刷新页面就回到 idle，下次进 ⚙ 重新看状态即可。
 */

export type EmbedStage = 'idle' | 'running' | 'done' | 'error'

interface EmbedderStore {
  stage: EmbedStage
  /** 'all'：全量重生成；'missing'：仅补缺 + stale */
  mode: 'all' | 'missing'
  progress: { done: number; total: number }
  /** 上次任务结果（仅 done / error 时有意义） */
  lastResult: {
    generated: number
    saved: number
    model: string
    errors: string[]
  } | null
  errorMessage: string
  abortController: AbortController | null

  start: (mode: 'all' | 'missing', controller: AbortController) => void
  setProgress: (done: number, total: number) => void
  finish: (result: EmbedderStore['lastResult']) => void
  fail: (msg: string) => void
  reset: () => void
  cancel: () => void
}

export const useEmbedderStore = create<EmbedderStore>((set, get) => ({
  stage: 'idle',
  mode: 'missing',
  progress: { done: 0, total: 0 },
  lastResult: null,
  errorMessage: '',
  abortController: null,

  start(mode, controller) {
    set({
      stage: 'running',
      mode,
      abortController: controller,
      progress: { done: 0, total: 0 },
      errorMessage: '',
    })
  },
  setProgress(done, total) {
    set({ progress: { done, total } })
  },
  finish(result) {
    set({
      stage: 'done',
      lastResult: result,
      abortController: null,
    })
  },
  fail(msg) {
    set({ stage: 'error', errorMessage: msg, abortController: null })
  },
  reset() {
    set({
      stage: 'idle',
      progress: { done: 0, total: 0 },
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
