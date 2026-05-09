import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import type { BookmarkCard, Category } from '../types/bookmark'
import { getRepository } from '../repositories'
import { importFromBrowserBookmarks } from '../services/bookmarkImporter'

interface BookmarkState {
  categories: Category[]
  cards: BookmarkCard[]
  activeCategoryId: string | null
  searchKeyword: string
  loading: boolean
  initialized: boolean

  // ----- actions -----
  init: () => Promise<void>
  importFromBrowser: () => Promise<void>
  setActiveCategory: (id: string | null) => void
  setSearchKeyword: (kw: string) => void

  addCategory: (name: string, icon?: string) => Promise<Category>
  renameCategory: (id: string, name: string) => Promise<void>
  removeCategory: (id: string) => Promise<void>
  removeCategories: (ids: string[]) => Promise<void>
  reorderCategories: (orderedIds: string[]) => Promise<void>

  addCard: (input: {
    categoryId: string
    title: string
    url: string
  }) => Promise<BookmarkCard>
  updateCard: (id: string, patch: Partial<BookmarkCard>) => Promise<void>
  removeCard: (id: string) => Promise<void>
  moveCard: (cardId: string, targetCategoryId: string, targetIndex: number) => Promise<void>
  reorderCardsInCategory: (categoryId: string, orderedIds: string[]) => Promise<void>
}

export const useBookmarkStore = create<BookmarkState>((set, get) => ({
  categories: [],
  cards: [],
  activeCategoryId: null,
  searchKeyword: '',
  loading: false,
  initialized: false,

  async init() {
    set({ loading: true })
    const repo = getRepository()
    const [categories, cards] = await Promise.all([
      repo.getCategories(),
      repo.getCards(),
    ])
    set({
      categories,
      cards,
      activeCategoryId: categories[0]?.id ?? null,
      loading: false,
      initialized: true,
    })
  },

  async importFromBrowser() {
    set({ loading: true })
    try {
      const { categories, cards } = await importFromBrowserBookmarks()
      const repo = getRepository()

      // 合并策略：按"分类名"去重，保留已存在的分类，仅新增未出现过的
      const existing = await repo.getCategories()
      const existingNames = new Set(existing.map((c) => c.name))
      const newCategories = categories.filter((c) => !existingNames.has(c.name))

      // 把卡片中指向"已存在分类"的 categoryId 重新指向 existing 里的同名分类
      const nameToExistingId = new Map(existing.map((c) => [c.name, c.id]))
      const newIdToOldId = new Map<string, string>()
      for (const newCat of categories) {
        const existed = nameToExistingId.get(newCat.name)
        if (existed) newIdToOldId.set(newCat.id, existed)
      }
      const remappedCards = cards.map((card) =>
        newIdToOldId.has(card.categoryId)
          ? { ...card, categoryId: newIdToOldId.get(card.categoryId)! }
          : card
      )

      // 用批量方法一次性写入，避免并发"读-改-写"竞态
      await repo.saveCategories(newCategories)
      await repo.saveCards(remappedCards)

      await get().init()
    } finally {
      set({ loading: false })
    }
  },

  setActiveCategory(id) {
    set({ activeCategoryId: id })
  },

  setSearchKeyword(kw) {
    set({ searchKeyword: kw })
  },

  async addCategory(name, icon) {
    const now = Date.now()
    const cat: Category = {
      id: uuid(),
      name,
      icon,
      order: get().categories.length,
      createdAt: now,
      updatedAt: now,
    }
    await getRepository().saveCategory(cat)
    set({
      categories: [...get().categories, cat],
      activeCategoryId: get().activeCategoryId ?? cat.id,
    })
    return cat
  },

  async renameCategory(id, name) {
    const cat = get().categories.find((c) => c.id === id)
    if (!cat) return
    const updated = { ...cat, name, updatedAt: Date.now() }
    await getRepository().saveCategory(updated)
    set({
      categories: get().categories.map((c) => (c.id === id ? updated : c)),
    })
  },

  async removeCategory(id) {
    await get().removeCategories([id])
  },

  async removeCategories(ids) {
    if (ids.length === 0) return
    // 本地同样要收集所有后代，保证内存状态与持久化一致
    const allCats = get().categories
    const allDeleteIds = collectDescendantIds(ids, allCats)
    await getRepository().deleteCategories(ids)   // repo 内部会级联
    const remaining = allCats.filter((c) => !allDeleteIds.has(c.id))
    set({
      categories: remaining,
      cards: get().cards.filter((c) => !allDeleteIds.has(c.categoryId)),
      activeCategoryId: allDeleteIds.has(get().activeCategoryId ?? '')
        ? remaining[0]?.id ?? null
        : get().activeCategoryId,
    })
  },

  async reorderCategories(orderedIds) {
    const map = new Map(get().categories.map((c) => [c.id, c]))
    const now = Date.now()
    const reordered: Category[] = orderedIds
      .map((id, idx) => {
        const c = map.get(id)
        return c ? { ...c, order: idx, updatedAt: now } : null
      })
      .filter((c): c is Category => c !== null)
    // 批量写入，避免并发"读-改-写"竞态
    await getRepository().saveCategories(reordered)
    set({ categories: reordered })
  },

  async addCard({ categoryId, title, url }) {
    const now = Date.now()
    const order = get().cards.filter((c) => c.categoryId === categoryId).length
    const card: BookmarkCard = {
      id: uuid(),
      categoryId,
      title,
      url,
      order,
      createdAt: now,
      updatedAt: now,
    }
    await getRepository().saveCard(card)
    set({ cards: [...get().cards, card] })
    return card
  },

  async updateCard(id, patch) {
    const card = get().cards.find((c) => c.id === id)
    if (!card) return
    const updated = { ...card, ...patch, updatedAt: Date.now() }
    await getRepository().saveCard(updated)
    set({ cards: get().cards.map((c) => (c.id === id ? updated : c)) })
  },

  async removeCard(id) {
    await getRepository().deleteCard(id)
    set({ cards: get().cards.filter((c) => c.id !== id) })
  },

  async moveCard(cardId, targetCategoryId, targetIndex) {
    const cards = [...get().cards]
    const card = cards.find((c) => c.id === cardId)
    if (!card) return
    const fromCategory = card.categoryId

    // 先把卡片归到新分类
    card.categoryId = targetCategoryId

    // 重排目标分类
    const targetGroup = cards
      .filter((c) => c.categoryId === targetCategoryId && c.id !== cardId)
      .sort((a, b) => a.order - b.order)
    targetGroup.splice(targetIndex, 0, card)
    targetGroup.forEach((c, i) => (c.order = i))

    // 重排原分类
    if (fromCategory !== targetCategoryId) {
      const fromGroup = cards
        .filter((c) => c.categoryId === fromCategory)
        .sort((a, b) => a.order - b.order)
      fromGroup.forEach((c, i) => (c.order = i))
    }

    await getRepository().saveCards(cards)
    set({ cards })
  },

  async reorderCardsInCategory(categoryId, orderedIds) {
    const cards = [...get().cards]
    const idxMap = new Map(orderedIds.map((id, i) => [id, i]))
    cards.forEach((c) => {
      if (c.categoryId === categoryId && idxMap.has(c.id)) {
        c.order = idxMap.get(c.id)!
      }
    })
    await getRepository().saveCards(
      cards.filter((c) => c.categoryId === categoryId)
    )
    set({ cards })
  },
}))

/** BFS 收集所有后代分类 ID（与 LocalRepository 中的逻辑对称） */
function collectDescendantIds(ids: string[], allCats: Category[]): Set<string> {
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
