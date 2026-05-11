import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useBookmarkStore } from '../stores/useBookmarkStore'
import { getRepository } from '../repositories'
import type { ExportData } from '../types/bookmark'
import type { BulkImportMode } from '../repositories/types'
import { cn } from '../utils/cn'
import { WebSearchBox } from './WebSearchBox'

interface PendingImport {
  data: ExportData
  catCount: number
  cardCount: number
  fileName: string
}

export function Topbar() {
  const importFromBrowser = useBookmarkStore((s) => s.importFromBrowser)
  const init = useBookmarkStore((s) => s.init)

  // 待确认的导入数据（弹层用）
  const [pending, setPending] = useState<PendingImport | null>(null)
  const [mode, setMode] = useState<BulkImportMode>('merge')
  const [importing, setImporting] = useState(false)

  // 设置面板开关（齿轮 icon 触发）
  const [settingsOpen, setSettingsOpen] = useState(false)

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

  // 包装一层：执行后自动关闭设置面板，避免再点一次
  const runAndClose = (fn: () => void | Promise<void>) => async () => {
    setSettingsOpen(false)
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
        <button
          onClick={() => setSettingsOpen(true)}
          className={cn(
            'w-9 h-9 flex items-center justify-center rounded-md text-base',
            'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100',
            'hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors',
          )}
          title="设置 / 数据管理"
          aria-label="设置"
        >
          ⚙
        </button>
      </div>

      {settingsOpen &&
        createPortal(
          <SettingsDialog
            onClose={() => setSettingsOpen(false)}
            onImportFromBrowser={runAndClose(importFromBrowser)}
            onImportJson={runAndClose(handleImport)}
            onExportJson={runAndClose(handleExport)}
          />,
          document.body,
        )}

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

// ─── 设置 / 数据管理弹层 ──────────────────────────
function SettingsDialog({
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
        className={cn(
          'w-[460px] max-w-[92vw] rounded-lg shadow-2xl',
          'bg-white dark:bg-slate-800',
          'border border-slate-200 dark:border-slate-700',
        )}
      >
        {/* 头 */}
        <div className="px-5 py-3 flex items-center justify-between border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <span className="text-base">⚙</span>
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">
              设置
            </h3>
          </div>
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
        <div className="px-5 py-4 space-y-4">
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              数据管理
            </h4>
            <div className="space-y-2">
              <ActionItem
                icon="🌐"
                title="从浏览器导入书签"
                desc="一键合并 Chrome 现有书签到 Tab It，按文件夹层级保留分类。"
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
          </section>
        </div>

        {/* 底 */}
        <div className="px-5 py-3 flex items-center justify-end border-t border-slate-200 dark:border-slate-700">
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
        </div>
      </div>
    </div>
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
