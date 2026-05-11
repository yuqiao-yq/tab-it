import { cn } from './cn'

/**
 * 图标值有三种来源（统一存储为 string）：
 *   1. emoji / 普通字符串：'📁' '⭐' 'A'
 *   2. 远端图片 URL：'https://...'  / 'http://...'
 *   3. 本地上传图片：'data:image/...'  (base64 dataURL)
 *
 * 这里给出统一的判定 + 渲染工具，业务层不必感知这些差异。
 */
export function isImageIcon(value?: string | null): boolean {
  if (!value) return false
  return /^(https?:|data:image\/)/i.test(value.trim())
}

interface IconViewProps {
  /** 图标值。空值 → 使用 fallback */
  value?: string
  /** 当 value 为空时显示的 emoji 占位（如 '📁'） */
  fallback?: string
  /** 渲染为 emoji 时的字号控制（tailwind 类） */
  emojiClassName?: string
  /** 渲染为图片时的尺寸控制（tailwind 类） */
  imgClassName?: string
  /** 容器额外样式 */
  className?: string
  /** title 提示 */
  title?: string
}

/**
 * 通用图标渲染：根据值类型自动切换 <img/> 或文本。
 * 业务层只关心存什么，不需要管渲染分支。
 */
export function IconView({
  value,
  fallback = '📁',
  emojiClassName = 'text-base leading-none',
  imgClassName = 'w-5 h-5 rounded-sm object-contain',
  className,
  title,
}: IconViewProps) {
  const v = value?.trim()
  if (isImageIcon(v)) {
    return (
      <img
        src={v}
        alt=""
        title={title}
        className={cn(imgClassName, className)}
        onError={(e) => {
          ;(e.currentTarget as HTMLImageElement).style.visibility = 'hidden'
        }}
      />
    )
  }
  return (
    <span title={title} className={cn(emojiClassName, className)}>
      {v || fallback}
    </span>
  )
}

/**
 * 常用 emoji 候选（按场景大致分组）。
 * 控制在 ~60 个，覆盖常见使用场景，又不至于让选择面板溢出。
 */
export const COMMON_EMOJIS: string[] = [
  // 文件夹/分类基础
  '📁', '📂', '🗂️', '🗃️', '📋', '📝', '📄', '📑',
  // 收藏 / 标记
  '⭐', '🌟', '🔖', '🏷️', '❤️', '🔥', '💎', '👑',
  // 工作 / 学习
  '💼', '💻', '⌨️', '🖥️', '🖱️', '📊', '📈', '📉',
  '📚', '🎓', '🔬', '🧪', '✏️', '🖊️', '📐', '🧮',
  // 创意 / 设计
  '🎨', '🖌️', '🖼️', '🎬', '🎥', '📷', '🎵', '🎮',
  // 工具 / 配置
  '🛠️', '⚙️', '🔧', '🔨', '🧰', '🔌', '💡', '🔋',
  // 网络 / 通讯
  '🌐', '📧', '💬', '📞', '📱', '🔔', '📡', '☁️',
  // 生活 / 其他
  '🍔', '🛒', '✈️', '🏠', '🚀', '🎁', '🌈', '✅',
]
