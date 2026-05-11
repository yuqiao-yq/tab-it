import { browser } from 'wxt/browser'

/**
 * Background Script
 * - Chrome MV3：作为 service worker 运行
 * - Firefox MV2：作为长期持有的 background script 运行
 *
 * 职责：
 * - 监听浏览器原生书签变化（用于和自定义卡片关联同步）
 * - 处理上下文菜单、跨页通信等后台任务
 */
export default defineBackground(() => {
  console.log('[Tab It] Background script started')

  // 监听浏览器书签变化（V1 暂不处理，V2 同步时使用）
  browser.bookmarks?.onCreated?.addListener((id, bookmark) => {
    console.log('[Tab It] Bookmark created:', id, bookmark)
  })

  browser.bookmarks?.onRemoved?.addListener((id) => {
    console.log('[Tab It] Bookmark removed:', id)
  })

  browser.bookmarks?.onChanged?.addListener((id, changeInfo) => {
    console.log('[Tab It] Bookmark changed:', id, changeInfo)
  })
})
