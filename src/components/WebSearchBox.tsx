import { useEffect, useRef, useState } from 'react'
import { cn } from '../utils/cn'
import { getFaviconUrl } from '../utils/favicon'

/**
 * 网页搜索框（替代浏览器地址栏）
 * - 支持切换 Google / Bing / 百度 / DuckDuckGo
 * - 选择的引擎持久化在 localStorage
 * - 回车提交：在「新标签页」打开搜索结果（与 Chrome 新标签页搜索一致）
 *
 * 由于本扩展接管了 chrome://newtab，用户失去了原生搜索栏，所以这里补一个等价能力。
 */

interface Engine {
  id: string
  name: string
  /** 用于引擎图标的代表 URL */
  homepage: string
  /** {q} 占位符将被替换为编码后的查询词 */
  searchUrl: string
}

const ENGINES: Engine[] = [
  { id: 'google',     name: 'Google',     homepage: 'https://www.google.com',     searchUrl: 'https://www.google.com/search?q={q}' },
  { id: 'bing',       name: 'Bing',       homepage: 'https://www.bing.com',       searchUrl: 'https://www.bing.com/search?q={q}' },
  { id: 'baidu',      name: '百度',        homepage: 'https://www.baidu.com',       searchUrl: 'https://www.baidu.com/s?wd={q}' },
  { id: 'duckduckgo', name: 'DuckDuckGo', homepage: 'https://duckduckgo.com',     searchUrl: 'https://duckduckgo.com/?q={q}' },
]

const STORAGE_KEY = 'tabit:web-search-engine'

function loadEngine(): Engine {
  try {
    const id = localStorage.getItem(STORAGE_KEY)
    return ENGINES.find((e) => e.id === id) ?? ENGINES[0]
  } catch {
    return ENGINES[0]
  }
}

export function WebSearchBox() {
  const [engine, setEngine] = useState<Engine>(() => loadEngine())
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  // 持久化用户选择的引擎
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, engine.id)
    } catch {
      /* ignore */
    }
  }, [engine])

  // 点击外部关闭引擎下拉
  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const submit = () => {
    const q = query.trim()
    if (!q) return
    const url = engine.searchUrl.replace('{q}', encodeURIComponent(q))
    window.open(url, '_blank', 'noopener,noreferrer')
    setQuery('')
  }

  return (
    <div ref={wrapRef} className="relative flex-1 max-w-xl mx-auto">
      <div
        className={cn(
          'flex items-center gap-1 pl-2 pr-1 py-1 rounded-lg',
          'border border-slate-200 dark:border-slate-700',
          'bg-white/60 dark:bg-slate-800/60 backdrop-blur',
          'focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20 transition-all',
        )}
      >
        {/* 引擎选择按钮 */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            'flex items-center gap-1 pl-1.5 pr-1 py-1 rounded',
            'text-xs text-slate-600 dark:text-slate-300',
            'hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors',
          )}
          title={`切换搜索引擎（当前：${engine.name}）`}
        >
          <img
            src={getFaviconUrl(engine.homepage, 16)}
            alt=""
            className="w-4 h-4 rounded-sm"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden' }}
          />
          <span className="text-[10px] text-slate-400">▾</span>
        </button>

        <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1" />

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
          placeholder={`使用 ${engine.name} 搜索网页…`}
          className={cn(
            'flex-1 min-w-0 px-2 py-1 text-sm bg-transparent outline-none',
            'placeholder:text-slate-400',
          )}
        />

        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 px-1.5 text-xs"
            title="清空"
          >✕</button>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={!query.trim()}
          className={cn(
            'px-2.5 py-1 rounded text-xs font-medium transition-colors',
            query.trim()
              ? 'bg-brand text-white hover:bg-brand-600'
              : 'bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500 cursor-not-allowed',
          )}
          title="搜索 (Enter)"
        >
          搜索
        </button>
      </div>

      {/* 引擎下拉列表 */}
      {open && (
        <div
          className={cn(
            'absolute z-20 left-0 mt-1.5 min-w-[180px] py-1 rounded-lg',
            'border border-slate-200 dark:border-slate-700',
            'bg-white dark:bg-slate-800 shadow-lg',
          )}
        >
          {ENGINES.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => { setEngine(e); setOpen(false) }}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left',
                'hover:bg-slate-100 dark:hover:bg-slate-700/60',
                e.id === engine.id ? 'text-brand font-medium' : 'text-slate-700 dark:text-slate-200',
              )}
            >
              <img
                src={getFaviconUrl(e.homepage, 16)}
                alt=""
                className="w-4 h-4 rounded-sm"
                onError={(ev) => { (ev.currentTarget as HTMLImageElement).style.visibility = 'hidden' }}
              />
              <span className="flex-1">{e.name}</span>
              {e.id === engine.id && <span className="text-xs">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
