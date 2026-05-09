import type { BookmarkCard, Category } from '../types/bookmark'
import { v4 as uuid } from 'uuid'

/**
 * 从浏览器原生书签构建分类与卡片。
 *
 * 策略：
 * - 每个文件夹（任何层级）独立成一个分类，分类名直接用文件夹名
 * - 每个分类只收录该文件夹**直接子层**的 url 书签（不递归扁平）
 * - 子文件夹的书签归入子文件夹对应的分类
 * - 通过 parentId 字段维护层级关系，供侧栏树形展示
 *
 * 例：
 *   书签栏/
 *   ├── google.com      → 归入"书签栏"
 *   └── 工作/           → 分类"工作"（parentId = 书签栏分类id）
 *       ├── jira.com    → 归入"工作"
 *       └── 项目A/      → 分类"项目A"（parentId = 工作分类id）
 *           └── doc.com → 归入"项目A"
 */
export async function importFromBrowserBookmarks(): Promise<{
  categories: Category[]
  cards: BookmarkCard[]
}> {
  if (!chrome.bookmarks) {
    return { categories: [], cards: [] }
  }
  const tree = await chrome.bookmarks.getTree()
  const root = tree[0]
  if (!root?.children) return { categories: [], cards: [] }

  const categories: Category[] = []
  const cards: BookmarkCard[] = []
  const now = Date.now()
  const orderRef = { value: 0 }

  for (const topNode of root.children) {
    walkFolder(topNode, undefined, categories, cards, orderRef, now)
  }

  return { categories, cards }
}

/**
 * 深度优先遍历。
 * @param node       当前书签节点
 * @param parentId   对应父分类的 id（根容器无父分类时为 undefined）
 */
function walkFolder(
  node: chrome.bookmarks.BookmarkTreeNode,
  parentId: string | undefined,
  categories: Category[],
  cards: BookmarkCard[],
  orderRef: { value: number },
  now: number
) {
  // url 节点不是文件夹，不会在此入口被调用（由父级处理）
  if (node.url || !node.children) return

  // 只收直接子层的 url 书签
  const directUrls = node.children.filter((c) => c.url)
  // 直接子层的文件夹
  const subFolders = node.children.filter((c) => !c.url)

  // 如果没有任何直接书签 & 没有任何子文件夹，跳过
  if (directUrls.length === 0 && subFolders.length === 0) return

  // 为该文件夹创建分类
  const cat: Category = {
    id: uuid(),
    name: node.title?.trim() || '未命名',
    parentId,
    order: orderRef.value++,
    createdAt: now,
    updatedAt: now,
  }
  categories.push(cat)

  // 直接子 url → 归入本分类
  directUrls.forEach((u, i) => {
    cards.push({
      id: uuid(),
      categoryId: cat.id,
      title: u.title?.trim() || u.url || '未命名',
      url: u.url!,
      order: i,
      bookmarkId: u.id,
      createdAt: now,
      updatedAt: now,
    })
  })

  // 子文件夹递归处理，parentId 指向当前分类
  for (const sub of subFolders) {
    walkFolder(sub, cat.id, categories, cards, orderRef, now)
  }
}
