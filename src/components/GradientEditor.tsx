import { useMemo, useState } from 'react'
import { cn } from '../utils/cn'

/**
 * 调色盘 + 渐变编辑器
 *
 * 三种类型：
 *   - solid   纯色（1 个颜色）
 *   - linear  线性渐变（2 ~ 5 个色标 + 角度 0–360°）
 *   - radial  径向渐变（2 ~ 5 个色标，固定 circle）
 *
 * 每个色标自带：
 *   - HTML5 原生调色盘（<input type="color">），跨平台、零依赖
 *   - hex 文本框（双向绑定，可手动输入 / 粘贴 / 验证）
 *
 * 设计取舍：
 *   - 不引入 react-colorful 等第三方拾色器，保持包大小
 *   - 反解（parseGradient）只覆盖本编辑器自己产出的格式，
 *     URL / dataURL 等无法反解的初始值会回退到默认（极光配色）
 *   - 编辑状态完全本地维护，不和 settings.wallpaper 实时双向绑定，
 *     避免用户编辑时点了预设缩略图导致正在编辑的状态被清掉
 *   - 用户点 "应用为壁纸" 才一次性写回 onApply
 */

type GradientType = 'solid' | 'linear' | 'radial'

interface Props {
  /** 当前壁纸 CSS（用于初始化）；非渐变格式（URL / dataURL）会被忽略 */
  initialCss?: string
  /** 应用为壁纸的回调，参数为合法的 CSS background-image 值 */
  onApply: (css: string) => void
}

const DEFAULT_COLORS = ['#c084fc', '#818cf8', '#38bdf8']
const DEFAULT_ANGLE = 135
const MAX_COLORS = 5
const HEX_RE = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/

export function GradientEditor({ initialCss, onApply }: Props) {
  const initial = useMemo(() => parseGradient(initialCss), [initialCss])

  const [type, setType] = useState<GradientType>(initial.type)
  const [colors, setColors] = useState<string[]>(initial.colors)
  const [angle, setAngle] = useState<number>(initial.angle)

  // 当前要应用的 CSS（实时计算，用于预览 + 应用按钮 + CSS 文本回显）
  const css = useMemo(
    () => buildCss(type, colors, angle),
    [type, colors, angle],
  )

  const updateColor = (i: number, v: string) =>
    setColors((arr) => arr.map((c, idx) => (idx === i ? v : c)))

  const removeColor = (i: number) => {
    if (colors.length <= 1) return
    setColors((arr) => arr.filter((_, idx) => idx !== i))
  }

  const addColor = () => {
    if (colors.length >= MAX_COLORS) return
    // 复制一份末色，方便用户在已有调色板上微调
    const last = colors[colors.length - 1] || '#888888'
    setColors((arr) => [...arr, last])
  }

  /** 从类型切换：solid → 仅留首色；linear/radial → 至少有 2 色 */
  const switchType = (next: GradientType) => {
    setType(next)
    if (next === 'solid') {
      setColors((arr) => [arr[0] || '#888888'])
    } else if (colors.length < 2) {
      setColors((arr) => [arr[0] || '#c084fc', '#38bdf8'])
    }
  }

  return (
    <div
      className={cn(
        'rounded-md border border-slate-200 dark:border-slate-700 p-3 space-y-3',
        'bg-slate-50/60 dark:bg-slate-900/30',
      )}
    >
      {/* 类型切换 segmented */}
      <div
        className={cn(
          'flex items-center gap-0.5 p-0.5 rounded',
          'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700',
        )}
      >
        {(
          [
            ['solid', '纯色'],
            ['linear', '线性渐变'],
            ['radial', '径向渐变'],
          ] as [GradientType, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => switchType(k)}
            className={cn(
              'flex-1 text-xs py-1.5 rounded transition-colors',
              type === k
                ? 'bg-brand text-white font-medium shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 颜色列表 */}
      <div className="space-y-1.5">
        {colors.map((c, i) => (
          <ColorRow
            key={i}
            color={c}
            label={
              type === 'solid'
                ? '主色'
                : i === 0
                  ? '起点'
                  : i === colors.length - 1
                    ? '终点'
                    : `中间 ${i}`
            }
            removable={type !== 'solid' && colors.length > 1}
            onChange={(v) => updateColor(i, v)}
            onRemove={() => removeColor(i)}
          />
        ))}
        {type !== 'solid' && colors.length < MAX_COLORS && (
          <button
            type="button"
            onClick={addColor}
            className={cn(
              'text-xs px-2 py-1 rounded',
              'text-slate-500 hover:text-brand hover:bg-slate-100 dark:hover:bg-slate-700/60',
              'transition-colors',
            )}
          >
            + 添加颜色
          </button>
        )}
      </div>

      {/* 角度（仅 linear） */}
      {type === 'linear' && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 shrink-0 w-8">角度</span>
          <input
            type="range"
            min={0}
            max={360}
            value={angle}
            onChange={(e) => setAngle(Number(e.target.value))}
            className="flex-1 accent-brand"
          />
          <input
            type="number"
            min={0}
            max={360}
            value={angle}
            onChange={(e) =>
              setAngle(
                Math.max(0, Math.min(360, Math.round(Number(e.target.value) || 0))),
              )
            }
            className={cn(
              'w-14 px-1.5 py-1 text-xs tabular-nums rounded',
              'bg-white dark:bg-slate-900',
              'border border-slate-200 dark:border-slate-700',
              'outline-none focus:border-brand focus:ring-1 focus:ring-brand/30',
            )}
          />
          <span className="text-xs text-slate-400">°</span>
        </div>
      )}

      {/* 实时预览 + 应用按钮 */}
      <div className="flex items-stretch gap-2">
        <div
          className="flex-1 h-12 rounded border border-slate-200 dark:border-slate-700 overflow-hidden"
          // solid 用 backgroundColor 让透明像素也能显示；
          // linear/radial 用 backgroundImage（CSS 函数语法）
          style={
            type === 'solid'
              ? { backgroundColor: css }
              : { backgroundImage: css, backgroundSize: 'cover' }
          }
          aria-label="实时预览"
        />
        <button
          type="button"
          onClick={() => onApply(css)}
          className={cn(
            'px-3 text-xs font-medium rounded shrink-0',
            'bg-brand text-white hover:bg-brand-600 transition-colors',
          )}
        >
          应用为壁纸
        </button>
      </div>

      {/* CSS 文本回显（方便用户复制到样式表 / 分享） */}
      <code
        className={cn(
          'block text-[10px] font-mono break-all',
          'text-slate-500 dark:text-slate-400',
          'px-2 py-1 rounded bg-white/60 dark:bg-slate-800/60',
          'border border-slate-200/60 dark:border-slate-700/60',
        )}
        title="点击可全选复制"
      >
        {css}
      </code>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
 * 单个色标行：调色盘 + hex 文本框 + 标签 + 删除
 * ───────────────────────────────────────────────────────────── */
function ColorRow({
  color,
  label,
  removable,
  onChange,
  onRemove,
}: {
  color: string
  label: string
  removable: boolean
  onChange: (v: string) => void
  onRemove: () => void
}) {
  // hex 输入框允许中间过渡态（例如用户在敲 #abc 的过程中），
  // 仅在文本「合法 hex」时才同步到上层 state；不合法时保留草稿在本地。
  const [draft, setDraft] = useState<string | null>(null)
  const display = draft ?? color

  const commitDraft = () => {
    if (draft === null) return
    if (HEX_RE.test(draft)) {
      onChange(normalizeHex(draft))
    }
    setDraft(null) // 不论合法与否都退出草稿态，让显示回到上层值
  }

  return (
    <div className="flex items-center gap-2">
      {/* 调色盘：用 input[type=color] 触发系统拾色器 */}
      <input
        type="color"
        value={normalizeHex(color)}
        onChange={(e) => {
          setDraft(null)
          onChange(e.target.value.toLowerCase())
        }}
        className={cn(
          'w-9 h-8 rounded cursor-pointer shrink-0',
          'border border-slate-200 dark:border-slate-600',
          // 多数浏览器 input[type=color] 默认有内边距；用 padding-0 让色块占满
          'p-0 bg-transparent',
        )}
        title="打开调色盘"
        aria-label="选择颜色"
      />
      {/* hex 文本输入 */}
      <input
        type="text"
        value={display}
        onChange={(e) => setDraft(e.target.value.trim())}
        onBlur={commitDraft}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur()
          if (e.key === 'Escape') setDraft(null)
        }}
        spellCheck={false}
        className={cn(
          'w-24 px-2 py-1 text-xs font-mono rounded',
          'bg-white dark:bg-slate-900',
          'border border-slate-200 dark:border-slate-700',
          'outline-none focus:border-brand focus:ring-1 focus:ring-brand/30',
          // 草稿态如果非法，给一点警示色
          draft !== null && !HEX_RE.test(draft) && 'border-red-300 dark:border-red-500/60',
        )}
      />
      <span className="text-[11px] text-slate-400 flex-1 truncate">{label}</span>
      {removable && (
        <button
          type="button"
          onClick={onRemove}
          className={cn(
            'w-6 h-6 flex items-center justify-center rounded shrink-0',
            'text-slate-400 hover:text-red-500',
            'hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors',
          )}
          title="删除该色"
          aria-label="删除该色"
        >
          ✕
        </button>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
 * CSS 输入输出工具
 * ───────────────────────────────────────────────────────────── */

function buildCss(type: GradientType, colors: string[], angle: number): string {
  const safe = colors.map(normalizeHex).filter((c) => HEX_RE.test(c))
  const list = (safe.length ? safe : ['#888888']).join(', ')
  if (type === 'solid') return safe[0] || '#888888'
  if (type === 'linear') return `linear-gradient(${angle}deg, ${list})`
  return `radial-gradient(circle, ${list})`
}

/**
 * 反解 CSS 字符串为编辑器初始状态。
 * 仅识别本编辑器产出的格式：
 *   - 纯 hex（"#rrggbb" / "#rgb"）→ solid
 *   - "linear-gradient(<deg>deg, c1, c2, ...)" → linear
 *   - "radial-gradient(circle, c1, c2, ...)"  → radial
 * 其他形态（URL、dataURL、渐变带百分比等）一律 fallback 到默认极光。
 */
function parseGradient(css?: string): {
  type: GradientType
  colors: string[]
  angle: number
} {
  const fallback = {
    type: 'linear' as const,
    colors: DEFAULT_COLORS.slice(),
    angle: DEFAULT_ANGLE,
  }
  if (!css) return fallback
  const trimmed = css.trim()
  if (!trimmed) return fallback

  if (HEX_RE.test(trimmed)) {
    return { type: 'solid', colors: [normalizeHex(trimmed)], angle: DEFAULT_ANGLE }
  }

  const linMatch = /^linear-gradient\(\s*(-?\d+(?:\.\d+)?)deg\s*,\s*([^)]+)\)$/i.exec(
    trimmed,
  )
  if (linMatch) {
    const angle = Math.max(0, Math.min(360, Math.round(Number(linMatch[1]))))
    const cols = extractHexList(linMatch[2])
    if (cols.length > 0) return { type: 'linear', colors: cols, angle }
  }

  const radMatch = /^radial-gradient\(\s*[^,]+,\s*([^)]+)\)$/i.exec(trimmed)
  if (radMatch) {
    const cols = extractHexList(radMatch[1])
    if (cols.length > 0) {
      return { type: 'radial', colors: cols, angle: DEFAULT_ANGLE }
    }
  }

  return fallback
}

/** 从 "color stop" 列表里提取 hex（忽略百分比 / 关键字） */
function extractHexList(s: string): string[] {
  return s
    .split(',')
    .map((part) => {
      const m = /(#[0-9a-fA-F]{3,6})/.exec(part)
      return m ? normalizeHex(m[1]) : ''
    })
    .filter(Boolean)
}

/** 把 "#abc" 扩成 "#aabbcc"，并统一小写 */
function normalizeHex(h: string): string {
  if (!h) return h
  const lower = h.toLowerCase()
  if (lower.length === 4 && lower.startsWith('#')) {
    return (
      '#' +
      lower
        .slice(1)
        .split('')
        .map((c) => c + c)
        .join('')
    )
  }
  return lower
}
