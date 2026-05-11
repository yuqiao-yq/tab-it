import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useBookmarkStore } from '../stores/useBookmarkStore'
import { getRepository } from '../repositories'
import type { ExportData, UserSettings } from '../types/bookmark'
import type { BulkImportMode } from '../repositories/types'
import { cn } from '../utils/cn'
import { WebSearchBox } from './WebSearchBox'
import { CardMenu } from './CardMenu'

interface PendingImport {
  data: ExportData
  catCount: number
  cardCount: number
  fileName: string
}

export function Topbar() {
  const importFromBrowser = useBookmarkStore((s) => s.importFromBrowser)
  const init = useBookmarkStore((s) => s.init)
  const settings = useBookmarkStore((s) => s.settings)
  const updateSettings = useBookmarkStore((s) => s.updateSettings)

  // 待确认的导入数据（弹层用）
  const [pending, setPending] = useState<PendingImport | null>(null)
  const [mode, setMode] = useState<BulkImportMode>('merge')
  const [importing, setImporting] = useState(false)

  // 两类设置弹窗（互斥；从齿轮气泡菜单触发）
  const [dataDialogOpen, setDataDialogOpen] = useState(false)
  const [styleDialogOpen, setStyleDialogOpen] = useState(false)

  const handleExport = async () => {
    const data = await getRepository().bulkExport()
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tab-it-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      const text = await file.text()
      let data: any
      try {
        data = JSON.parse(text)
      } catch {
        window.alert('导入失败：文件格式错误')
        return
      }
      const cats = Array.isArray(data?.categories) ? data.categories : []
      const cards = Array.isArray(data?.cards) ? data.cards : []
      if (cats.length === 0 && cards.length === 0) {
        window.alert('导入失败：未识别到分类或书签数据')
        return
      }
      setMode('merge') // 每次都默认安全的合并
      setPending({
        data,
        catCount: cats.length,
        cardCount: cards.length,
        fileName: file.name,
      })
    }
    input.click()
  }

  const handleConfirmImport = async () => {
    if (!pending) return
    setImporting(true)
    try {
      const result = await getRepository().bulkImport(pending.data, mode)
      await init()
      setPending(null)
      if (result.mode === 'replace') {
        window.alert(
          `已替换全部数据：${result.categoriesAdded} 个分类、${result.cardsAdded} 个书签`,
        )
      } else {
        window.alert(
          `合并完成：\n` +
            `  分类  新增 ${result.categoriesAdded} / 更新 ${result.categoriesUpdated}\n` +
            `  书签  新增 ${result.cardsAdded} / 更新 ${result.cardsUpdated}`,
        )
      }
    } catch (err) {
      console.error(err)
      window.alert(
        '导入失败：' + (err instanceof Error ? err.message : '未知错误'),
      )
    } finally {
      setImporting(false)
    }
  }

  // 包装一层：执行后自动关闭数据管理面板，避免再点一次
  const runAndCloseData = (fn: () => void | Promise<void>) => async () => {
    setDataDialogOpen(false)
    await fn()
  }

  return (
    <header
      className={
        'flex items-center gap-3 px-4 py-2.5 ' +
        'min-h-[60px] shrink-0 ' +
        'border-b border-slate-200/60 dark:border-slate-700/60'
      }
    >
      <h1 className="text-lg font-semibold text-brand shrink-0 leading-none">Tab It</h1>
      {/* 中央：网页搜索框（替代被覆盖的浏览器地址栏，支持切换搜索引擎） */}
      <WebSearchBox />
      <div className="flex items-center gap-2 shrink-0">
        {/* 齿轮 → 弹出小气泡菜单（复用 CardMenu，与卡片右键菜单同款样式） */}
        <CardMenu
          align="right"
          menuWidth={150}
          ariaLabel="设置"
          items={[
            {
              key: 'data',
              label: '数据管理',
              icon: <DatabaseIcon />,
              onSelect: () => setDataDialogOpen(true),
            },
            {
              key: 'style',
              label: '样式管理',
              icon: <PaletteIcon />,
              onSelect: () => setStyleDialogOpen(true),
            },
          ]}
          trigger={(toggle, isOpen) => (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                toggle()
              }}
              className={cn(
                'w-9 h-9 flex items-center justify-center rounded-md text-base',
                'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100',
                'hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors',
                isOpen && 'text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-800',
              )}
              title="设置"
              aria-label="设置"
            >
              ⚙
            </button>
          )}
        />
      </div>

      {/* 数据管理弹窗：3 个数据操作项 */}
      {dataDialogOpen &&
        createPortal(
          <DataDialog
            onClose={() => setDataDialogOpen(false)}
            onImportFromBrowser={runAndCloseData(importFromBrowser)}
            onImportJson={runAndCloseData(handleImport)}
            onExportJson={runAndCloseData(handleExport)}
          />,
          document.body,
        )}

      {/* 样式管理弹窗：主题切换 + 自定义背景 */}
      {styleDialogOpen &&
        createPortal(
          <StyleDialog
            settings={settings}
            onClose={() => setStyleDialogOpen(false)}
            onUpdate={updateSettings}
          />,
          document.body,
        )}

      {/* 导入数据二次确认弹层 */}
      {pending &&
        createPortal(
          <ImportDialog
            pending={pending}
            mode={mode}
            importing={importing}
            onChangeMode={setMode}
            onCancel={() => !importing && setPending(null)}
            onConfirm={handleConfirmImport}
          />,
          document.body,
        )}
    </header>
  )
}

// ─── 通用居中 Dialog 外壳 ──────────────────────────
function DialogShell({
  title,
  width = 460,
  onClose,
  children,
  footer,
}: {
  title: React.ReactNode
  width?: number
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  // ESC 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width }}
        className={cn(
          'max-w-[92vw] rounded-lg shadow-2xl',
          'bg-white dark:bg-slate-800',
          'border border-slate-200 dark:border-slate-700',
        )}
      >
        {/* 头 */}
        <div className="px-5 py-3 flex items-center justify-between border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className={cn(
              'w-7 h-7 flex items-center justify-center rounded text-sm',
              'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200',
              'hover:bg-slate-100 dark:hover:bg-slate-700/60',
            )}
            title="关闭"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>
        {/* 体 */}
        <div className="px-5 py-4">{children}</div>
        {/* 底 */}
        <div className="px-5 py-3 flex items-center justify-end gap-2 border-t border-slate-200 dark:border-slate-700">
          {footer ?? (
            <button
              type="button"
              onClick={onClose}
              className={cn(
                'px-3 py-1.5 text-sm rounded transition-colors',
                'text-slate-600 dark:text-slate-300',
                'hover:bg-slate-100 dark:hover:bg-slate-700/60',
              )}
            >
              关闭
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── 数据管理弹层 ──────────────────────────────────
function DataDialog({
  onClose,
  onImportFromBrowser,
  onImportJson,
  onExportJson,
}: {
  onClose: () => void
  onImportFromBrowser: () => void
  onImportJson: () => void
  onExportJson: () => void
}) {
  return (
    <DialogShell
      title={
        <span className="flex items-center gap-2">
          <span className="text-base">🗂️</span>
          <span>数据管理</span>
        </span>
      }
      onClose={onClose}
    >
      <div className="space-y-2">
        <ActionItem
          icon="🌐"
          title="从浏览器导入书签"
          desc="一键合并当前浏览器现有书签，按文件夹层级保留分类。"
          onClick={onImportFromBrowser}
        />
        <ActionItem
          icon="📥"
          title="导入配置文件"
          desc="选择 JSON 配置文件，支持「合并」或「替换」两种模式。"
          onClick={onImportJson}
        />
        <ActionItem
          icon="📤"
          title="导出配置文件"
          desc="将当前所有分类、书签、设置打包为 JSON 下载到本地。"
          onClick={onExportJson}
        />
      </div>
    </DialogShell>
  )
}

function ActionItem({
  icon,
  title,
  desc,
  onClick,
}: {
  icon: string
  title: string
  desc: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left px-3 py-2.5 rounded-md border transition-all',
        'flex items-start gap-3',
        'border-slate-200 dark:border-slate-700',
        'hover:border-brand/50 hover:bg-brand/5 dark:hover:bg-brand/10',
      )}
    >
      <span className="text-lg leading-none mt-0.5 shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-slate-800 dark:text-slate-100">
          {title}
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
          {desc}
        </div>
      </div>
      <span className="text-slate-300 dark:text-slate-600 text-sm leading-none mt-1 shrink-0">
        ›
      </span>
    </button>
  )
}

// ─── 样式管理弹层（主题 + 自定义背景） ─────────────
const PRESET_WALLPAPERS: Array<{ key: string; label: string; value: string; preview: string }> = [
  // value 为空字符串表示"无自定义背景"，回退到 global.css 的渐变
  { key: 'none', label: '默认', value: '', preview: 'linear-gradient(135deg, #f8fafc, #e0e7ff)' },
  {
    key: 'aurora',
    label: '极光',
    value: 'linear-gradient(135deg, #c084fc 0%, #818cf8 50%, #38bdf8 100%)',
    preview: 'linear-gradient(135deg, #c084fc 0%, #818cf8 50%, #38bdf8 100%)',
  },
  {
    key: 'sunset',
    label: '暮色',
    value: 'linear-gradient(135deg, #fb923c 0%, #f472b6 100%)',
    preview: 'linear-gradient(135deg, #fb923c 0%, #f472b6 100%)',
  },
  {
    key: 'ocean',
    label: '深海',
    value: 'linear-gradient(135deg, #38bdf8 0%, #6366f1 100%)',
    preview: 'linear-gradient(135deg, #38bdf8 0%, #6366f1 100%)',
  },
  {
    key: 'forest',
    label: '林荫',
    value: 'linear-gradient(135deg, #34d399 0%, #10b981 100%)',
    preview: 'linear-gradient(135deg, #34d399 0%, #10b981 100%)',
  },
  {
    key: 'midnight',
    label: '午夜',
    value: 'linear-gradient(135deg, #1e293b 0%, #312e81 100%)',
    preview: 'linear-gradient(135deg, #1e293b 0%, #312e81 100%)',
  },
]

const THEME_OPTIONS: Array<{ key: UserSettings['theme']; label: string; icon: string }> = [
  { key: 'light', label: '明亮', icon: '☀️' },
  { key: 'dark', label: '黑暗', icon: '🌙' },
  { key: 'auto', label: '跟随系统', icon: '🖥️' },
]

function StyleDialog({
  settings,
  onClose,
  onUpdate,
}: {
  settings: UserSettings
  onClose: () => void
  onUpdate: (patch: Partial<UserSettings>) => Promise<void>
}) {
  // 自定义图片 URL 输入（仅当 wallpaper 不在预设里时回填）
  const isPreset = PRESET_WALLPAPERS.some((p) => p.value === (settings.wallpaper ?? ''))
  const [customUrl, setCustomUrl] = useState(isPreset ? '' : (settings.wallpaper ?? ''))

  const handlePickPreset = (value: string) => {
    void onUpdate({ wallpaper: value })
    setCustomUrl('')
  }

  const handleApplyCustomUrl = () => {
    const url = customUrl.trim()
    if (!url) return
    void onUpdate({ wallpaper: url })
  }

  const handleUploadImage = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      // 限制 2MB，避免 chrome.storage.local 超限
      if (file.size > 2 * 1024 * 1024) {
        window.alert('图片过大，请选择 2MB 以内的图片')
        return
      }
      const reader = new FileReader()
      reader.onload = async () => {
        const dataUrl = String(reader.result || '')
        if (!dataUrl) return
        await onUpdate({ wallpaper: dataUrl })
        setCustomUrl(dataUrl)
      }
      reader.readAsDataURL(file)
    }
    input.click()
  }

  return (
    <DialogShell
      title={
        <span className="flex items-center gap-2">
          <span className="text-base">🎨</span>
          <span>样式管理</span>
        </span>
      }
      width={520}
      onClose={onClose}
    >
      <div className="space-y-5">
        {/* 主题 */}
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            主题
          </h4>
          <div className="grid grid-cols-3 gap-2">
            {THEME_OPTIONS.map((opt) => {
              const active = settings.theme === opt.key
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => void onUpdate({ theme: opt.key })}
                  className={cn(
                    'flex flex-col items-center gap-1 px-3 py-3 rounded-md border transition-all',
                    active
                      ? 'border-brand bg-brand/5 dark:bg-brand/10'
                      : 'border-slate-200 dark:border-slate-700 hover:border-brand/40 hover:bg-slate-50 dark:hover:bg-slate-700/40',
                  )}
                >
                  <span className="text-xl leading-none">{opt.icon}</span>
                  <span
                    className={cn(
                      'text-xs',
                      active
                        ? 'text-brand font-medium'
                        : 'text-slate-600 dark:text-slate-300',
                    )}
                  >
                    {opt.label}
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        {/* 自定义背景 */}
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            自定义背景
          </h4>

          {/* 预设缩略图 */}
          <div className="grid grid-cols-6 gap-2 mb-3">
            {PRESET_WALLPAPERS.map((p) => {
              const active = (settings.wallpaper ?? '') === p.value
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => handlePickPreset(p.value)}
                  title={p.label}
                  className={cn(
                    'group relative h-14 rounded-md overflow-hidden border-2 transition-all',
                    active
                      ? 'border-brand ring-2 ring-brand/30'
                      : 'border-slate-200 dark:border-slate-700 hover:border-brand/50',
                  )}
                  style={{ backgroundImage: p.preview, backgroundSize: 'cover' }}
                >
                  {p.key === 'none' && (
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] text-slate-500">
                      默认
                    </span>
                  )}
                  {active && p.key !== 'none' && (
                    <span className="absolute bottom-0.5 right-0.5 text-[10px] bg-brand text-white px-1 rounded">
                      ✓
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* 自定义图片：URL 输入 + 本地上传 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleApplyCustomUrl()
                }}
                placeholder="粘贴图片 URL（https:// 或 data:image/…）"
                className={cn(
                  'flex-1 px-3 py-1.5 text-sm rounded-md',
                  'border border-slate-200 dark:border-slate-700',
                  'bg-white dark:bg-slate-900',
                  'outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all',
                  'placeholder:text-slate-400',
                )}
              />
              <button
                type="button"
                onClick={handleApplyCustomUrl}
                disabled={!customUrl.trim()}
                className={cn(
                  'px-3 py-1.5 text-sm rounded font-medium transition-colors',
                  'bg-brand text-white hover:bg-brand-600',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
              >
                应用
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleUploadImage}
                className={cn(
                  'px-3 py-1.5 text-xs rounded transition-colors',
                  'border border-slate-200 dark:border-slate-700',
                  'text-slate-600 dark:text-slate-300',
                  'hover:bg-slate-100 dark:hover:bg-slate-700/60',
                )}
              >
                📁 从本地上传
              </button>
              {settings.wallpaper && (
                <button
                  type="button"
                  onClick={() => {
                    void onUpdate({ wallpaper: '' })
                    setCustomUrl('')
                  }}
                  className={cn(
                    'px-3 py-1.5 text-xs rounded transition-colors',
                    'text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10',
                  )}
                >
                  ✕ 清除背景
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              提示：本地上传的图片会以 base64 存储在浏览器本地，建议小于 2MB。
            </p>
          </div>
        </section>
      </div>
    </DialogShell>
  )
}

// ─── 导入确认弹层 ─────────────────────────────────
function ImportDialog({
  pending,
  mode,
  importing,
  onChangeMode,
  onCancel,
  onConfirm,
}: {
  pending: PendingImport
  mode: BulkImportMode
  importing: boolean
  onChangeMode: (m: BulkImportMode) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40"
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'w-[420px] max-w-[90vw] rounded-lg shadow-2xl',
          'bg-white dark:bg-slate-800',
          'border border-slate-200 dark:border-slate-700',
        )}
      >
        {/* 头 */}
        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">
            导入书签数据
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
            来源：{pending.fileName}
          </p>
        </div>

        {/* 体 */}
        <div className="px-5 py-4 space-y-3">
          <div className="text-sm text-slate-600 dark:text-slate-300">
            检测到{' '}
            <span className="font-medium text-brand">{pending.catCount}</span>{' '}
            个分类、
            <span className="font-medium text-brand">
              {' '}
              {pending.cardCount}
            </span>{' '}
            个书签。
          </div>

          {/* 模式选择 */}
          <div className="space-y-2">
            <ModeOption
              checked={mode === 'merge'}
              onSelect={() => onChangeMode('merge')}
              title="合并到现有数据"
              badge="推荐"
              desc="保留本地分类与书签，按 ID 合并。同 ID 取较新者，新数据追加到末尾。"
            />
            <ModeOption
              checked={mode === 'replace'}
              onSelect={() => onChangeMode('replace')}
              title="替换全部数据"
              badge="慎用"
              badgeDanger
              desc="清空本地所有分类与书签，并使用文件中的设置覆盖当前主题/布局。"
            />
          </div>
        </div>

        {/* 底 */}
        <div className="px-5 py-3 flex items-center justify-end gap-2 border-t border-slate-200 dark:border-slate-700">
          <button
            type="button"
            disabled={importing}
            onClick={onCancel}
            className={cn(
              'px-3 py-1.5 text-sm rounded transition-colors',
              'text-slate-600 dark:text-slate-300',
              'hover:bg-slate-100 dark:hover:bg-slate-700/60',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            取消
          </button>
          <button
            type="button"
            disabled={importing}
            onClick={onConfirm}
            className={cn(
              'px-3.5 py-1.5 text-sm rounded font-medium transition-colors',
              mode === 'replace'
                ? 'bg-red-500 text-white hover:bg-red-600'
                : 'bg-brand text-white hover:bg-brand-600',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {importing
              ? '导入中…'
              : mode === 'replace'
                ? '确认替换'
                : '确认合并'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ModeOption({
  checked,
  onSelect,
  title,
  desc,
  badge,
  badgeDanger,
}: {
  checked: boolean
  onSelect: () => void
  title: string
  desc: string
  badge?: string
  badgeDanger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full text-left px-3 py-2.5 rounded-md border transition-all',
        'flex items-start gap-2.5',
        checked
          ? 'border-brand bg-brand/5 dark:bg-brand/10'
          : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/40',
      )}
    >
      {/* 单选圆 */}
      <span
        className={cn(
          'mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center',
          checked
            ? 'border-brand'
            : 'border-slate-300 dark:border-slate-600',
        )}
      >
        {checked && <span className="w-2 h-2 rounded-full bg-brand" />}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
            {title}
          </span>
          {badge && (
            <span
              className={cn(
                'text-[10px] leading-none px-1.5 py-0.5 rounded-sm',
                badgeDanger
                  ? 'bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-300'
                  : 'bg-brand/10 text-brand',
              )}
            >
              {badge}
            </span>
          )}
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
          {desc}
        </div>
      </div>
    </button>
  )
}

// ─── 菜单内置 icon（14x14，与 CardMenu.MenuIcons 风格统一） ──
function DatabaseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v6c0 1.66 4.03 3 9 3s9-1.34 9-3V5" />
      <path d="M3 11v6c0 1.66 4.03 3 9 3s9-1.34 9-3v-6" />
    </svg>
  )
}

function PaletteIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
      <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
      <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
      <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
    </svg>
  )
}
