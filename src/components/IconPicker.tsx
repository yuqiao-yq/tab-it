import { useEffect, useRef, useState } from 'react'
import { cn } from '../utils/cn'
import { COMMON_EMOJIS, IconView, isImageIcon } from '../utils/icon'

type Tab = 'emoji' | 'url' | 'upload'

interface Props {
  /** 当前图标值（可能是 emoji / URL / dataURL） */
  value?: string
  /** 选中新值时回调（传 undefined 表示恢复默认） */
  onChange: (value: string | undefined) => void
  /** 触发器自定义渲染（不传则用默认按钮：当前 IconView） */
  trigger?: (open: () => void) => React.ReactNode
  /** 默认 emoji（用于"恢复默认"按钮的提示） */
  defaultEmoji?: string
  /** 上传图片大小上限（KB），默认 100 */
  maxUploadKB?: number
  /** 弹层定位，默认 bottom-left */
  align?: 'left' | 'right'
}

/**
 * 通用图标选择器：
 * - Emoji：从常用候选里选
 * - URL：粘贴图片链接，实时预览
 * - 上传：选本地图片，转 base64 存入（用于离线/私域图）
 *
 * 弹层 portal 简化处理：absolute 定位 + click outside 关闭
 */
export function IconPicker({
  value,
  onChange,
  trigger,
  defaultEmoji = '📁',
  maxUploadKB = 100,
  align = 'left',
}: Props) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>(() =>
    isImageIcon(value) ? 'url' : 'emoji',
  )
  const [urlDraft, setUrlDraft] = useState(isImageIcon(value) ? value! : '')
  const [uploadError, setUploadError] = useState<string | null>(null)

  const wrapRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // 点击外部关闭
  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  // 打开时同步当前值的 tab + URL 草稿
  useEffect(() => {
    if (open) {
      setTab(isImageIcon(value) ? 'url' : 'emoji')
      setUrlDraft(isImageIcon(value) ? value! : '')
      setUploadError(null)
    }
  }, [open, value])

  const pick = (next: string | undefined) => {
    onChange(next)
    setOpen(false)
  }

  const handleUpload = (file: File) => {
    setUploadError(null)
    if (!file.type.startsWith('image/')) {
      setUploadError('请选择图片文件')
      return
    }
    const sizeKB = file.size / 1024
    if (sizeKB > maxUploadKB) {
      setUploadError(`图片过大（${sizeKB.toFixed(0)}KB），上限 ${maxUploadKB}KB`)
      return
    }
    const reader = new FileReader()
    reader.onload = () => pick(String(reader.result))
    reader.onerror = () => setUploadError('读取失败')
    reader.readAsDataURL(file)
  }

  return (
    <div ref={wrapRef} className="relative inline-block">
      {trigger ? (
        trigger(() => setOpen((v) => !v))
      ) : (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
          className={cn(
            'flex items-center justify-center w-7 h-7 rounded',
            'hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors',
          )}
          title="修改图标"
        >
          <IconView
            value={value}
            fallback={defaultEmoji}
            emojiClassName="text-lg leading-none"
            imgClassName="w-5 h-5 rounded-sm object-contain"
          />
        </button>
      )}

      {open && (
        <div
          // 阻止点击冒泡到外层卡片（避免触发卡片的打开/拖拽）
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className={cn(
            'absolute z-30 mt-1.5 w-72 p-2 rounded-lg',
            'border border-slate-200 dark:border-slate-700',
            'bg-white dark:bg-slate-800 shadow-xl',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {/* 顶部：当前图标预览 + tab 切换 + 恢复默认 */}
          <div className="flex items-center gap-1 mb-2">
            <div
              className={cn(
                'w-8 h-8 flex items-center justify-center rounded',
                'bg-slate-100 dark:bg-slate-900 shrink-0',
              )}
            >
              <IconView
                value={value}
                fallback={defaultEmoji}
                emojiClassName="text-xl leading-none"
                imgClassName="w-6 h-6 rounded-sm object-contain"
              />
            </div>
            <div className="flex-1 grid grid-cols-3 gap-0.5 bg-slate-100 dark:bg-slate-900 rounded p-0.5">
              {(
                [
                  ['emoji', 'Emoji'],
                  ['url', '链接'],
                  ['upload', '上传'],
                ] as [Tab, string][]
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTab(k)}
                  className={cn(
                    'text-xs py-1 rounded transition-colors',
                    tab === k
                      ? 'bg-white dark:bg-slate-700 text-brand font-medium shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-200',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => pick(undefined)}
              className={cn(
                'text-[11px] px-1.5 py-1 rounded shrink-0',
                'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200',
                'hover:bg-slate-100 dark:hover:bg-slate-700/60',
              )}
              title="恢复默认图标"
            >
              重置
            </button>
          </div>

          {/* Emoji 网格 */}
          {tab === 'emoji' && (
            <div className="grid grid-cols-8 gap-0.5 max-h-56 overflow-y-auto pr-1">
              {COMMON_EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => pick(e)}
                  className={cn(
                    'aspect-square flex items-center justify-center rounded text-lg leading-none',
                    'hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors',
                    value === e && 'bg-brand/10 ring-1 ring-brand/40',
                  )}
                  title={e}
                >
                  {e}
                </button>
              ))}
            </div>
          )}

          {/* URL 输入 */}
          {tab === 'url' && (
            <div className="flex flex-col gap-2 py-1">
              <input
                value={urlDraft}
                onChange={(e) => setUrlDraft(e.target.value)}
                placeholder="https://example.com/icon.png"
                spellCheck={false}
                className={cn(
                  'w-full px-2 py-1.5 text-xs rounded font-mono',
                  'bg-white dark:bg-slate-900',
                  'border border-slate-200 dark:border-slate-700',
                  'focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand/30',
                )}
              />
              {urlDraft && (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span>预览：</span>
                  <img
                    src={urlDraft}
                    alt=""
                    className="w-6 h-6 rounded-sm object-contain bg-slate-100 dark:bg-slate-900"
                  />
                </div>
              )}
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={!urlDraft.trim()}
                  onClick={() => pick(urlDraft.trim())}
                  className={cn(
                    'px-2.5 py-1 rounded text-xs font-medium transition-colors',
                    urlDraft.trim()
                      ? 'bg-brand text-white hover:bg-brand-600'
                      : 'bg-slate-100 text-slate-400 cursor-not-allowed dark:bg-slate-700 dark:text-slate-500',
                  )}
                >
                  应用
                </button>
              </div>
            </div>
          )}

          {/* 上传 */}
          {tab === 'upload' && (
            <div className="flex flex-col gap-2 py-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleUpload(file)
                  e.target.value = '' // 允许重复选同一文件
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  'w-full py-6 rounded border-2 border-dashed text-xs',
                  'border-slate-300 dark:border-slate-600',
                  'text-slate-500 dark:text-slate-400',
                  'hover:border-brand hover:text-brand transition-colors',
                )}
              >
                点击选择本地图片
                <div className="text-[10px] mt-1 opacity-60">
                  支持 PNG / JPG / SVG，建议 ≤ {maxUploadKB}KB
                </div>
              </button>
              {uploadError && (
                <div className="text-xs text-red-500 px-1">{uploadError}</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
