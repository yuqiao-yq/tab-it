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

/**
 * Chrome 的 _favicon 端点支持的离散尺寸（来源：Chromium 官方文档）。
 * 不在该列表中的 size 会被服务端就近缩放，反而失真。
 * Google s2/favicons 接受任意尺寸但实际也只在常见档位输出，对齐这套档位最稳。
 */
const SUPPORTED_FAVICON_SIZES = [16, 24, 32, 48, 64, 96, 128, 256] as const

/**
 * 把 displaySize（CSS 像素）按 devicePixelRatio 放大到物理像素，
 * 并向上取整到最接近的支持档位。
 *
 * 例：displaySize=16, dpr=2 → physical=32 → snap=32
 *     displaySize=28, dpr=2 → physical=56 → snap=64
 *     displaySize=32, dpr=3 → physical=96 → snap=96
 */
function pickPhysicalSize(displaySize: number): number {
  const dpr =
    typeof window !== 'undefined' && window.devicePixelRatio
      ? Math.max(1, Math.min(4, window.devicePixelRatio))
      : 1
  const physical = Math.ceil(displaySize * dpr)
  for (const s of SUPPORTED_FAVICON_SIZES) {
    if (s >= physical) return s
  }
  return SUPPORTED_FAVICON_SIZES[SUPPORTED_FAVICON_SIZES.length - 1]
}

/**
 * 获取网站 favicon URL。
 *
 * @param pageUrl  目标网址
 * @param size     期望的「CSS 显示尺寸」（不是物理像素）。函数内部会按
 *                 devicePixelRatio 自动放大请求，确保 Retina/HiDPI 屏不糊。
 *                 默认 32（适合常规书签卡）。
 */
export function getFaviconUrl(pageUrl: string, size = 32): string {
  if (!pageUrl) return ''
  const physicalSize = pickPhysicalSize(size)
  if (isChromeRuntime) {
    try {
      // Chrome MV3 的 _favicon 端点（仅 Chromium 内核可用）
      // 这里直接用全局 chrome.runtime.getURL：
      // - WXT 的 browser.runtime.getURL 把参数收敛到 PublicPath（只允许 build 产出的静态资源），
      //   而 '/_favicon/' 是 Chrome 运行时内置端点，不在静态资源里，会导致类型报错
      // - chrome.* 是 Chrome 原生注入的全局对象，类型来自 @types/chrome，没有该限制
      if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
        const url = new URL(chrome.runtime.getURL('/_favicon/'))
        url.searchParams.set('pageUrl', pageUrl)
        url.searchParams.set('size', String(physicalSize))
        return url.toString()
      }
    } catch {
      /* fallthrough to Google */
    }
  }
  // 降级方案：Google s2/favicons（Firefox / 取不到 runtime 时）
  try {
    const u = new URL(pageUrl)
    return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=${physicalSize}`
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
