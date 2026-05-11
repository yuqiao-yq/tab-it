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

  addCategory: (name: string, icon?: string, parentId?: string) => Promise<Category>
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
      const { categories: imported, cards: importedCards } =
        await importFromBrowserBookmarks()
      const repo = getRepository()
      const existingCats = await repo.getCategories()
      const existingCards = await repo.getCards()

      // ─── 分类合并：按「同父级 + 同名」匹配 ───────────────────────
      // 早期版本只按 name 匹配会出两个问题：
      // 1) 同名异级（"杂项"在不同父级下）会被错误合并
      // 2) 新建分类的 parentId 若指向"已被命中复用的旧分类"，
      //    没做 remap → 新分类成了孤儿（parentId 指向不存在的 uuid）
      //    → 表现为「删了某文件夹后再导入，看不到这个文件夹」
      //
      // 这里改用 BFS 按层级处理：父级先确定 finalId，子级再据此匹配。
      const importedByParent = groupBy(imported, (c) => c.parentId ?? '')
      const existingByParent = groupBy(existingCats, (c) => c.parentId ?? '')

      const newIdToFinalId = new Map<string, string>()
      const catsToCreate: Category[] = []

      const queue: (string | undefined)[] = [undefined] // 顶层
      while (queue.length > 0) {
        const importedParent = queue.shift()
        // 该 importedParent 在最终数据中对应的 parentId
        // - 顶层（importedParent 为 undefined）→ undefined
        // - 否则查 newIdToFinalId
        const finalParent = importedParent
          ? newIdToFinalId.get(importedParent)
          : undefined

        const siblings = importedByParent.get(importedParent ?? '') ?? []
        const existingSiblings =
          existingByParent.get(finalParent ?? '') ?? []
        const existingByName = new Map(
          existingSiblings.map((c) => [c.name, c]),
        )

        for (const newCat of siblings) {
          const hit = existingByName.get(newCat.name)
          if (hit) {
            // 已存在同父同名分类 → 复用旧 id，不重复创建
            newIdToFinalId.set(newCat.id, hit.id)
          } else {
            // 新分类：保留新 uuid，但 parentId 必须指向最终 id
            newIdToFinalId.set(newCat.id, newCat.id)
            catsToCreate.push({ ...newCat, parentId: finalParent })
          }
          // 当前节点入队，处理其子层
          queue.push(newCat.id)
        }
      }

      // ─── 卡片合并：按 (categoryId, url) 去重 ──────────────────────
      // 早期版本按 card.id upsert，但 importer 每次都生成新 uuid，
      // 导致已经导过的书签每次都会作为新记录追加 → 重复。
      const remappedCards = importedCards.map((card) => ({
        ...card,
        categoryId:
          newIdToFinalId.get(card.categoryId) ?? card.categoryId,
      }))
      const existingKey = new Set(
        existingCards.map((c) => `${c.categoryId}::${c.url}`),
      )
      const cardsToAdd = remappedCards.filter(
        (c) => !existingKey.has(`${c.categoryId}::${c.url}`),
      )

      // ─── 写入 ────────────────────────────────────────────────
      if (catsToCreate.length > 0) await repo.saveCategories(catsToCreate)
      if (cardsToAdd.length > 0) await repo.saveCards(cardsToAdd)

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

  async addCategory(name, icon, parentId) {
    const now = Date.now()
    // order 取同一父级（顶层 = parentId 为空）下的现有数量，避免新分类排到陌生位置
    const siblingCount = get().categories.filter(
      (c) => (c.parentId ?? '') === (parentId ?? '')
    ).length
    const cat: Category = {
      id: uuid(),
      name,
      icon,
      parentId,
      order: siblingCount,
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

/** 简易 groupBy：按 keyFn 分桶 */
function groupBy<T, K>(arr: T[], keyFn: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>()
  for (const item of arr) {
    const k = keyFn(item)
    const list = map.get(k)
    if (list) list.push(item)
    else map.set(k, [item])
  }
  return map
}
