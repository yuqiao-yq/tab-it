import { useEffect, useState } from 'react'
import { getFaviconUrl, getHostname } from '../utils/favicon'
import { cn } from '../utils/cn'

interface Props {
  /** 目标网页 URL；从中推导 favicon 与首字母 */
  url: string
  /** CSS 显示尺寸（px），传给 getFaviconUrl 内部按 dpr 自动放大物理像素 */
  size?: number
  /** 直接覆盖 img 的 className（含尺寸 / 圆角等） */
  className?: string
  /** 占位块的 className 兜底；不传时自动复用 className */
  fallbackClassName?: string
}

/**
 * 统一的 favicon 渲染组件：
 * - 正常加载：展示真实 favicon
 * - 加载失败：展示「域名首字母」彩色占位块（用域名做哈希取色，保证同站颜色稳定）
 *
 * 之前各处直接用 <img onError={visibility:hidden}>，失败时卡片上会留个空洞，
 * 现在改成有意义的占位，视觉更完整、辨识度更高。
 */
export function FaviconImg({
  url,
  size = 32,
  className,
  fallbackClassName,
}: Props) {
  const [errored, setErrored] = useState(false)

  // url 变了就重置 error 态，否则切换书签时第一次加载就会被认为失败
  useEffect(() => {
    setErrored(false)
  }, [url])

  if (errored) {
    return (
      <FaviconFallback
        url={url}
        className={fallbackClassName ?? className}
      />
    )
  }

  return (
    <img
      src={getFaviconUrl(url, size)}
      alt=""
      className={className}
      onError={() => setErrored(true)}
      // referrerpolicy 对 google s2/favicons 友好，避免某些站点 referrer 校验失败
      referrerPolicy="no-referrer"
    />
  )
}

/**
 * 域名首字母占位：
 * - 文字：取 hostname（去掉 www）的首字符；中文域名也能取到第一个汉字
 * - 背景色：基于 hostname 的简单 hash 选取一个稳定的浅彩色（同站永远同色）
 * - 字色：根据背景亮度自动用白或黑，保证对比
 */
export function FaviconFallback({
  url,
  className,
}: {
  url: string
  className?: string
}) {
  const host = getHostname(url) || url || '?'
  // 取第一个非空字符；空时兜底
  const initial = (host.trim().charAt(0) || '?').toUpperCase()
  const { bg, fg } = pickColors(host)

  return (
    <div
      className={cn(
        'inline-flex items-center justify-center font-semibold leading-none select-none',
        className,
      )}
      style={{ backgroundColor: bg, color: fg }}
      aria-hidden
      title={host}
    >
      {initial}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
 * 颜色工具
 * ───────────────────────────────────────────────────────────── */

/** 12 种柔和但有辨识度的背景色，保证视觉协调 */
const PALETTE = [
  '#fda4af', // rose
  '#fb923c', // orange
  '#fbbf24', // amber
  '#a3e635', // lime
  '#34d399', // emerald
  '#22d3ee', // cyan
  '#60a5fa', // blue
  '#818cf8', // indigo
  '#c084fc', // purple
  '#f472b6', // pink
  '#94a3b8', // slate
  '#facc15', // yellow
]

function pickColors(seed: string): { bg: string; fg: string } {
  // 简单的字符 hash → 落到 palette 索引；确定性 → 同站颜色稳定
  let h = 0
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) & 0xffffffff
  }
  const bg = PALETTE[Math.abs(h) % PALETTE.length]
  // 用 YIQ 公式判定亮度：>128 用深色字，<=128 用白色字
  const r = parseInt(bg.slice(1, 3), 16)
  const g = parseInt(bg.slice(3, 5), 16)
  const b = parseInt(bg.slice(5, 7), 16)
  const yiq = (r * 299 + g * 587 + b * 114) / 1000
  const fg = yiq > 150 ? '#1f2937' : '#ffffff'
  return { bg, fg }
}
