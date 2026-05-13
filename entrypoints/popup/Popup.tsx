import { useEffect, useMemo, useState } from 'react'
import { browser } from 'wxt/browser'
import { useBookmarkStore } from '../../src/stores/useBookmarkStore'
import type { Category } from '../../src/types/bookmark'
import { getHostname } from '../../src/utils/favicon'
import { cn } from '../../src/utils/cn'
import { FaviconImg } from '../../src/components/FaviconImg'

/**
 * 浏览器工具栏图标的 Popup。
 *
 * 两个主操作：
 *  1. 「打开 Tab It 新标签页」—— 打开一个新的 chrome://newtab
 *  2. 「添加当前页面」—— 把当前 active tab 的 title/url 加为 Tab It 书签
 *
 * 数据通道：
 *  - 复用 useBookmarkStore，通过 init() 拉一遍数据；写入走同一个 IndexedDB
 *  - popup 与 newtab 是独立的 web context，写入后 newtab 不会自动刷新
 *    （V1 接受这个限制；用户切回 newtab 手动刷新或重开即可）
 *
 * 主题与样式：
 *  - 复用 global.css 与 tailwind 配色，尺寸由 index.html 内联固定为 320px 宽
 *  - 暗色模式跟随 prefers-color-scheme（popup 没有 newtab 的主题切换 UI，
 *    简化处理为「跟随系统」）
 */
export default function Popup() {
  const init = useBookmarkStore((s) => s.init)
  const initialized = useBookmarkStore((s) => s.initialized)
  const categories = useBookmarkStore((s) => s.categories)
  const activeCategoryId = useBookmarkStore((s) => s.activeCategoryId)
  const addCard = useBookmarkStore((s) => s.addCard)
  const cards = useBookmarkStore((s) => s.cards)

  // 当前 active tab 信息（用于「添加当前页面」）
  const [tabInfo, setTabInfo] = useState<{ url: string; title: string } | null>(
    null,
  )
  const [draftTitle, setDraftTitle] = useState('')
  const [targetCategoryId, setTargetCategoryId] = useState<string>('')

  // 提交态：'idle' | 'saving' | 'saved' | 'duplicate' | 'invalid'
  const [submitState, setSubmitState] = useState<
    'idle' | 'saving' | 'saved' | 'duplicate' | 'invalid'
  >('idle')

  // ─── 跟随系统主题 ─────────────────────────────
  // popup 没有完整的主题选择 UI，简单跟随 prefers-color-scheme；
  // 这样亮/暗系统都能得到协调的视觉
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (isDark: boolean) =>
      document.documentElement.classList.toggle('dark', isDark)
    apply(mq.matches)
    const onChange = (e: MediaQueryListEvent) => apply(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // ─── 初始化：拉 store + 读当前 tab ───────────────
  useEffect(() => {
    void init()
    void loadActiveTab().then((info) => {
      if (!info) return
      setTabInfo(info)
      setDraftTitle(info.title)
    })
  }, [init])

  // 默认目标分类：优先用 newtab 上次激活的；否则取第一个顶层分类
  useEffect(() => {
    if (!initialized) return
    if (targetCategoryId) return
    const fallback =
      activeCategoryId ??
      categories.find((c) => !c.parentId)?.id ??
      categories[0]?.id ??
      ''
    setTargetCategoryId(fallback)
  }, [initialized, activeCategoryId, categories, targetCategoryId])

  // 顶层 + 子级，按 order 排序，渲染时用前缀缩进表达层级
  const flatCategories = useMemo(() => buildIndentedList(categories), [
    categories,
  ])

  const handleOpenNewTab = () => {
    // 用 chrome.* 直接调，避免 WXT browser 类型对 path 的 PublicPath 收敛
    if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
      const url = chrome.runtime.getURL('/newtab.html')
      void browser.tabs.create({ url })
      window.close()
      return
    }
    // 兜底：直接 fallback 到 newtab 命名（Firefox 也用同名）
    void browser.tabs.create({ url: 'newtab.html' })
    window.close()
  }

  const handleAddCurrentPage = async () => {
    if (!tabInfo || !targetCategoryId) return
    const title = draftTitle.trim() || tabInfo.title || tabInfo.url
    const url = tabInfo.url.trim()
    if (!url) {
      setSubmitState('invalid')
      return
    }
    // 避免重复添加：同分类下 url 相同直接提示
    const exists = cards.some(
      (c) => c.categoryId === targetCategoryId && c.url === url,
    )
    if (exists) {
      setSubmitState('duplicate')
      // 2 秒后回到 idle，避免一直堵在错误态
      setTimeout(() => setSubmitState('idle'), 2000)
      return
    }
    try {
      setSubmitState('saving')
      await addCard({ categoryId: targetCategoryId, title, url })
      setSubmitState('saved')
      // 1.2 秒后自动关闭，保持轻量
      setTimeout(() => window.close(), 1200)
    } catch {
      setSubmitState('invalid')
    }
  }

  const isInternalTab = tabInfo
    ? /^(chrome|edge|about|moz-extension|chrome-extension):/i.test(tabInfo.url)
    : false

  const canAdd =
    !!tabInfo &&
    !isInternalTab &&
    !!targetCategoryId &&
    submitState !== 'saving' &&
    submitState !== 'saved'

  return (
    // 显式固定宽度，做 index.html 那段 !important 的双重保险：
    // 即便 Tailwind base layer 在 popup 里碰巧后加载也不会再被压成窄柱
    <div
      style={{ width: 360 }}
      className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
    >
      {/* ───── Header ───── */}
      <header className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">
        <span className="text-base font-semibold text-brand leading-none">
          Tab It
        </span>
        <span className="text-[10px] text-slate-400 leading-none truncate">
          书签整理新标签页
        </span>
      </header>

      {/* ───── 主操作 ───── */}
      <div className="px-3 pt-3">
        <button
          type="button"
          onClick={handleOpenNewTab}
          className={cn(
            'w-full h-9 inline-flex items-center justify-center gap-2 rounded-md',
            'bg-brand text-white text-sm font-medium whitespace-nowrap',
            'hover:bg-brand-600 transition-colors',
          )}
        >
          <span aria-hidden>＋</span>
          打开 Tab It 新标签页
        </button>
      </div>

      {/* ───── 添加当前页面 ───── */}
      <section className="px-3 pt-3 pb-3">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
          添加当前页面
        </h4>

        {!tabInfo ? (
          <div className="text-xs text-slate-400 py-2">读取当前页面信息…</div>
        ) : isInternalTab ? (
          <div
            className={cn(
              'text-xs px-2.5 py-2 rounded',
              'bg-slate-50 dark:bg-slate-800',
              'text-slate-500 dark:text-slate-400',
            )}
          >
            浏览器内部页面（{getProtocolLabel(tabInfo.url)}）无法被添加为书签。
          </div>
        ) : (
          <div className="space-y-2">
            {/* 当前页面预览：favicon + url */}
            <div
              className={cn(
                'flex items-center gap-2 px-2 py-1.5 rounded',
                'bg-slate-50 dark:bg-slate-800/60',
                'border border-slate-200 dark:border-slate-700',
              )}
            >
              <FaviconImg
                url={tabInfo.url}
                size={16}
                className="w-4 h-4 rounded-sm shrink-0"
                fallbackClassName="w-4 h-4 rounded-sm text-[10px] shrink-0"
              />
              <span
                className="text-[11px] text-slate-500 dark:text-slate-400 truncate"
                title={tabInfo.url}
              >
                {getHostname(tabInfo.url)}
              </span>
            </div>

            {/* 标题（可编辑） */}
            <input
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              placeholder="书签标题"
              className={cn(
                'w-full px-2 py-1.5 text-sm rounded',
                'bg-white dark:bg-slate-900',
                'border border-slate-200 dark:border-slate-700',
                'outline-none focus:border-brand focus:ring-1 focus:ring-brand/30',
                'placeholder:text-slate-400',
              )}
            />

            {/* 分类选择 */}
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
                添加到
              </label>
              <select
                value={targetCategoryId}
                onChange={(e) => setTargetCategoryId(e.target.value)}
                disabled={!initialized || flatCategories.length === 0}
                className={cn(
                  'flex-1 px-2 py-1.5 text-sm rounded',
                  'bg-white dark:bg-slate-900',
                  'border border-slate-200 dark:border-slate-700',
                  'outline-none focus:border-brand focus:ring-1 focus:ring-brand/30',
                  'disabled:opacity-60',
                )}
              >
                {flatCategories.length === 0 ? (
                  <option value="">（暂无分类，请先到主页面新建）</option>
                ) : (
                  flatCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {'  '.repeat(c.depth)}
                      {c.depth > 0 ? '└ ' : ''}
                      {c.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* 状态条 + 提交按钮 */}
            <div className="flex items-center gap-2 pt-0.5">
              <StatusHint state={submitState} />
              <button
                type="button"
                onClick={handleAddCurrentPage}
                disabled={!canAdd}
                className={cn(
                  'h-8 px-3 text-xs font-medium rounded shrink-0 transition-colors',
                  canAdd
                    ? 'bg-brand text-white hover:bg-brand-600'
                    : 'bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500 cursor-not-allowed',
                )}
              >
                {submitState === 'saving'
                  ? '添加中…'
                  : submitState === 'saved'
                    ? '✓ 已添加'
                    : '添加到 Tab It'}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

/**
 * 读取当前激活的 tab 信息。
 * 失败（无 tabs 权限 / 用户拒绝 / popup 被独立打开）时返回 null。
 */
async function loadActiveTab(): Promise<{ url: string; title: string } | null> {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true })
    const t = tabs[0]
    if (!t || !t.url) return null
    return { url: t.url, title: (t.title || '').trim() }
  } catch {
    return null
  }
}

/**
 * 把分类树拉平为 [{ id, name, depth }, ...]，按层级缩进显示在 select 中。
 * 严格按 order 排序，确保和侧栏顺序一致。
 */
function buildIndentedList(
  categories: Category[],
): Array<{ id: string; name: string; depth: number }> {
  const byParent = new Map<string, Category[]>()
  for (const c of categories) {
    const k = c.parentId ?? ''
    const list = byParent.get(k) ?? []
    list.push(c)
    byParent.set(k, list)
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.order - b.order)
  }
  const result: Array<{ id: string; name: string; depth: number }> = []
  const dfs = (parentKey: string, depth: number) => {
    const siblings = byParent.get(parentKey) ?? []
    for (const c of siblings) {
      result.push({ id: c.id, name: c.name, depth })
      dfs(c.id, depth + 1)
    }
  }
  dfs('', 0)
  return result
}

/** 浏览器内部 URL 的友好标识 */
function getProtocolLabel(url: string): string {
  const m = /^([a-z-]+):/i.exec(url)
  return m ? m[1] : '内部'
}

function StatusHint({
  state,
}: {
  state: 'idle' | 'saving' | 'saved' | 'duplicate' | 'invalid'
}) {
  if (state === 'duplicate') {
    return (
      <span className="flex-1 text-[11px] text-amber-600 dark:text-amber-400">
        该分类下已有此 URL
      </span>
    )
  }
  if (state === 'invalid') {
    return (
      <span className="flex-1 text-[11px] text-red-500">
        添加失败，请检查标题与 URL
      </span>
    )
  }
  return <span className="flex-1" />
}
