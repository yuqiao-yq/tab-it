/**
 * Background Service Worker
 * - 监听浏览器原生书签变化（用于和自定义卡片关联同步）
 * - 处理上下文菜单、跨页通信等后台任务
 */
export default defineBackground(() => {
  console.log('[Tab It] Background service worker started')

  // 监听浏览器书签变化（V1 暂不处理，V2 同步时使用）
  chrome.bookmarks?.onCreated?.addListener((id, bookmark) => {
    console.log('[Tab It] Bookmark created:', id, bookmark)
  })

  chrome.bookmarks?.onRemoved?.addListener((id) => {
    console.log('[Tab It] Bookmark removed:', id)
  })

  chrome.bookmarks?.onChanged?.addListener((id, changeInfo) => {
    console.log('[Tab It] Bookmark changed:', id, changeInfo)
  })
})
