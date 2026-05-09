/**
 * 获取网站 favicon
 *
 * MV3 中浏览器提供了 favicon 权限，可以通过 chrome-extension://EXT_ID/_favicon/ 拿到。
 * 失败时降级到 Google s2/favicons 服务。
 */
export function getFaviconUrl(pageUrl: string, size = 32): string {
  if (!pageUrl) return ''
  try {
    // 优先使用浏览器内置 favicon API（需要 favicon 权限）
    if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
      const url = new URL(chrome.runtime.getURL('/_favicon/'))
      url.searchParams.set('pageUrl', pageUrl)
      url.searchParams.set('size', String(size))
      return url.toString()
    }
  } catch {
    /* fallthrough */
  }
  // 降级方案
  try {
    const u = new URL(pageUrl)
    return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=${size}`
  } catch {
    return ''
  }
}

/** 提取域名（用于显示） */
export function getHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
