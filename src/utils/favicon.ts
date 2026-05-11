/**
 * 获取网站 favicon
 *
 * - Chrome MV3：通过 chrome-extension://EXT_ID/_favicon/ 拿到（需要 favicon 权限）
 * - Firefox / 其他：直接走 Google s2/favicons 降级（Firefox 不支持 _favicon 端点）
 *
 * 浏览器嗅探：Chrome 会暴露 globalThis.chrome 且 navigator.userAgent 含 'Chrome'，
 * Firefox 也注入了 chrome 别名（webextension-polyfill 兼容用）但 UA 里有 'Firefox'。
 */
const isChromeRuntime = (() => {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  // 排除 Firefox / Edge Legacy 等含 'Chrome' 但行为不同的情形
  if (/Firefox\//.test(ua)) return false
  return /Chrome\//.test(ua) || /Edg\//.test(ua)
})()

export function getFaviconUrl(pageUrl: string, size = 32): string {
  if (!pageUrl) return ''
  if (isChromeRuntime) {
    try {
      // Chrome MV3 的 _favicon 端点
      if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
        const url = new URL(chrome.runtime.getURL('/_favicon/'))
        url.searchParams.set('pageUrl', pageUrl)
        url.searchParams.set('size', String(size))
        return url.toString()
      }
    } catch {
      /* fallthrough to Google */
    }
  }
  // 降级方案：Google s2/favicons（Firefox / 取不到 chrome.runtime 时）
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
