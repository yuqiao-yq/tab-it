import { create } from 'zustand'
import { getOkBookmarkIds } from '../../repositories/PageContentsDB'

/**
 * 已抓取正文的 bookmarkId 索引（V2.0 §6.1）
 *
 * 用途：BookmarkCardItem 卡片右上角角标判定「该卡是否已被抓取」，
 *      不能让每张卡片各自查 dexie（N 次 IO 性能差）。
 *
 * 维护时机：
 * - App mount 时 refresh 一次
 * - crawler 任务完成后 refresh
 * - 清空内容索引时 clear
 *
 * 中途进度不实时同步（用户看进度时通常停在 ⚙ 页，不会同时盯卡片网格）；
 * 任务完成时整体 refresh 已经够用。
 */

interface PageIndexStore {
  indexedIds: Set<string>
  loaded: boolean
  refresh: () => Promise<void>
  clear: () => void
}

export const usePageIndex = create<PageIndexStore>((set) => ({
  indexedIds: new Set(),
  loaded: false,

  async refresh() {
    try {
      const ids = await getOkBookmarkIds()
      set({ indexedIds: ids, loaded: true })
    } catch {
      // dexie 异常静默：UI 角标缺失但不影响功能
      set({ loaded: true })
    }
  },

  clear() {
    set({ indexedIds: new Set() })
  },
}))
