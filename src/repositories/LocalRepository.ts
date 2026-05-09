import type {
  BookmarkCard,
  Category,
  ExportData,
  UserSettings,
} from '../types/bookmark'
import { DEFAULT_SETTINGS } from '../types/bookmark'
import type { BookmarkRepository } from './types'

const KEYS = {
  categories: 'tabit:categories',
  cards: 'tabit:cards',
  settings: 'tabit:settings',
} as const

/**
 * 基于 chrome.storage.local 的本地实现。
 *
 * 适用场景：
 * - V1 MVP 全量数据
 * - V2 离线缓存
 *
 * 容量限制：5MB（够存数千个书签元数据）。
 * 大体积数据（缩略图等）后续迁到 Dexie/IndexedDB。
 */
export class LocalRepository implements BookmarkRepository {
  // ---------- helpers ----------
  private async readArray<T>(key: string): Promise<T[]> {
    const result = await chrome.storage.local.get(key)
    return (result[key] as T[]) ?? []
  }

  private async writeArray<T>(key: string, value: T[]): Promise<void> {
    await chrome.storage.local.set({ [key]: value })
  }

  // ---------- 分类 ----------
  async getCategories(): Promise<Category[]> {
    const list = await this.readArray<Category>(KEYS.categories)
    return list.sort((a, b) => a.order - b.order)
  }

  async saveCategory(cat: Category): Promise<void> {
    const list = await this.readArray<Category>(KEYS.categories)
    const idx = list.findIndex((c) => c.id === cat.id)
    if (idx >= 0) {
      list[idx] = { ...cat, updatedAt: Date.now() }
    } else {
      list.push({ ...cat, updatedAt: Date.now() })
    }
    await this.writeArray(KEYS.categories, list)
  }

  async saveCategories(cats: Category[]): Promise<void> {
    if (cats.length === 0) return
    const list = await this.readArray<Category>(KEYS.categories)
    const map = new Map(list.map((c) => [c.id, c]))
    const now = Date.now()
    for (const c of cats) {
      map.set(c.id, { ...c, updatedAt: now })
    }
    await this.writeArray(KEYS.categories, Array.from(map.values()))
  }

  async deleteCategory(id: string): Promise<void> {
    await this.deleteCategories([id])
  }

  async deleteCategories(ids: string[]): Promise<void> {
    if (ids.length === 0) return
    const [cats, cards] = await Promise.all([
      this.readArray<Category>(KEYS.categories),
      this.readArray<BookmarkCard>(KEYS.cards),
    ])
    // 级联找到所有后代分类（BFS）
    const allDeleteIds = collectDescendants(ids, cats)
    await Promise.all([
      this.writeArray(
        KEYS.categories,
        cats.filter((c) => !allDeleteIds.has(c.id))
      ),
      this.writeArray(
        KEYS.cards,
        cards.filter((c) => !allDeleteIds.has(c.categoryId))
      ),
    ])
  }

  // ---------- 卡片 ----------
  async getCards(categoryId?: string): Promise<BookmarkCard[]> {
    const list = await this.readArray<BookmarkCard>(KEYS.cards)
    const filtered = categoryId
      ? list.filter((c) => c.categoryId === categoryId)
      : list
    return filtered.sort((a, b) => a.order - b.order)
  }

  async saveCard(card: BookmarkCard): Promise<void> {
    const list = await this.readArray<BookmarkCard>(KEYS.cards)
    const idx = list.findIndex((c) => c.id === card.id)
    if (idx >= 0) {
      list[idx] = { ...card, updatedAt: Date.now() }
    } else {
      list.push({ ...card, updatedAt: Date.now() })
    }
    await this.writeArray(KEYS.cards, list)
  }

  async saveCards(cards: BookmarkCard[]): Promise<void> {
    const list = await this.readArray<BookmarkCard>(KEYS.cards)
    const map = new Map(list.map((c) => [c.id, c]))
    const now = Date.now()
    for (const c of cards) {
      map.set(c.id, { ...c, updatedAt: now })
    }
    await this.writeArray(KEYS.cards, Array.from(map.values()))
  }

  async deleteCard(id: string): Promise<void> {
    const list = await this.readArray<BookmarkCard>(KEYS.cards)
    await this.writeArray(
      KEYS.cards,
      list.filter((c) => c.id !== id)
    )
  }

  // ---------- 设置 ----------
  async getSettings(): Promise<UserSettings> {
    const result = await chrome.storage.local.get(KEYS.settings)
    return { ...DEFAULT_SETTINGS, ...(result[KEYS.settings] ?? {}) }
  }

  async saveSettings(settings: UserSettings): Promise<void> {
    await chrome.storage.local.set({ [KEYS.settings]: settings })
  }

  // ---------- 批量 ----------
  async bulkImport(data: ExportData): Promise<void> {
    await Promise.all([
      this.writeArray(KEYS.categories, data.categories),
      this.writeArray(KEYS.cards, data.cards),
      data.settings ? this.saveSettings(data.settings) : Promise.resolve(),
    ])
  }

  async bulkExport(): Promise<ExportData> {
    const [categories, cards, settings] = await Promise.all([
      this.getCategories(),
      this.getCards(),
      this.getSettings(),
    ])
    return {
      version: '1.0',
      exportedAt: Date.now(),
      categories,
      cards,
      settings,
    }
  }

  async clear(): Promise<void> {
    await chrome.storage.local.remove([
      KEYS.categories,
      KEYS.cards,
      KEYS.settings,
    ])
  }
}

/** 单例 */
export const localRepo = new LocalRepository()

/**
 * BFS 收集所有需删除的分类 ID（含后代）。
 * 删除"工作"时会自动收集"项目A"、"设计"等子孙分类。
 */
function collectDescendants(ids: string[], allCats: Category[]): Set<string> {
  const result = new Set(ids)
  const queue = [...ids]
  while (queue.length > 0) {
    const parentId = queue.shift()!
    for (const c of allCats) {
      if (c.parentId === parentId && !result.has(c.id)) {
        result.add(c.id)
        queue.push(c.id)
      }
    }
  }
  return result
}
