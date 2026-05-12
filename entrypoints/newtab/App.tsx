import { useEffect } from 'react'
import { useBookmarkStore } from '../../src/stores/useBookmarkStore'
import { CategorySidebar } from '../../src/components/CategorySidebar'
import { BookmarkGrid } from '../../src/components/BookmarkGrid'
import { Breadcrumb } from '../../src/components/Breadcrumb'
import { Topbar } from '../../src/components/Topbar'

export default function App() {
  const init = useBookmarkStore((s) => s.init)
  const initialized = useBookmarkStore((s) => s.initialized)
  const loading = useBookmarkStore((s) => s.loading)
  const categories = useBookmarkStore((s) => s.categories)
  const activeCategoryId = useBookmarkStore((s) => s.activeCategoryId)
  const importFromBrowser = useBookmarkStore((s) => s.importFromBrowser)
  const addCategory = useBookmarkStore((s) => s.addCategory)
  const theme = useBookmarkStore((s) => s.settings.theme)
  const wallpaper = useBookmarkStore((s) => s.settings.wallpaper)
  const fontColor = useBookmarkStore((s) => s.settings.fontColor)

  useEffect(() => {
    void init()
  }, [init])

  // ─── 主题（明亮 / 黑暗 / 跟随系统） ────────────────
  // Tailwind darkMode='class' → 通过 html.dark 控制
  useEffect(() => {
    const root = document.documentElement
    const apply = (isDark: boolean) => root.classList.toggle('dark', isDark)
    if (theme === 'dark') {
      apply(true)
      return
    }
    if (theme === 'light') {
      apply(false)
      return
    }
    // auto：监听系统配色
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    apply(mq.matches)
    const onChange = (e: MediaQueryListEvent) => apply(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])

  // ─── 自定义背景 ────────────────────────────────
  // 约定 wallpaper 字段语义：
  //   - 空 / undefined        → 清除自定义背景，回退到 global.css 的渐变
  //   - linear/radial/conic-  → 渐变，写 background-image
  //   - "#rrggbb" / "#rgb"    → 纯色，写 background-color（注意：
  //                              不能写 url("#xxx")，浏览器会忽略，这是历史 bug）
  //   - 其他（http/https/data:）→ 当图片 URL，写 background-image: url(...)
  useEffect(() => {
    const body = document.body
    // 每次切换都先 reset 上一轮可能残留的属性，避免「图片 → 纯色」时图片仍在
    body.style.backgroundImage = ''
    body.style.backgroundSize = ''
    body.style.backgroundPosition = ''
    body.style.backgroundAttachment = ''
    body.style.backgroundColor = ''
    if (!wallpaper) return

    const isGradient = /^(linear|radial|conic)-gradient\(/.test(wallpaper)
    const isHex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(wallpaper.trim())

    if (isGradient) {
      body.style.backgroundImage = wallpaper
      body.style.backgroundSize = 'cover'
      body.style.backgroundPosition = 'center'
      body.style.backgroundAttachment = 'fixed'
    } else if (isHex) {
      body.style.backgroundColor = wallpaper
    } else {
      body.style.backgroundImage = `url("${wallpaper}")`
      body.style.backgroundSize = 'cover'
      body.style.backgroundPosition = 'center'
      body.style.backgroundAttachment = 'fixed'
    }
  }, [wallpaper])

  // ─── 自定义文字颜色 ─────────────────────────────
  // 约定 fontColor 字段语义：
  //   - 空 / undefined → 清除自定义颜色，回退到 global.css 的默认
  //                      （亮色：text-slate-900；暗色：text-slate-100）
  //   - 任意有效 CSS 颜色（建议 hex）→ 写到 body 的 inline style
  // 注意：只影响"未显式设置颜色"的文字（如卡片标题）；
  // 显式带 text-slate-400 等类的辅助文字、按钮品牌色等不会被波及，这是预期行为。
  useEffect(() => {
    document.body.style.color = fontColor || ''
  }, [fontColor])

  // 顶层分类数量（侧栏只显示顶层）
  const topLevelCount = categories.filter((c) => !c.parentId).length

  return (
    <div className="h-full w-full flex flex-col">
      <Topbar />
      <div className="flex-1 flex min-h-0">
        <CategorySidebar />
        <main className="flex-1 overflow-y-auto p-6">
          {!initialized ? (
            <div className="text-center py-20 text-slate-400">加载中...</div>
          ) : topLevelCount === 0 ? (
            <EmptyState
              loading={loading}
              onImport={importFromBrowser}
              onCreate={() => addCategory('我的收藏', '⭐')}
            />
          ) : !activeCategoryId ? (
            <div className="text-center py-20 text-slate-400">
              ← 从左侧选择一个分类
            </div>
          ) : (
            <>
              <Breadcrumb />
              <BookmarkGrid />
            </>
          )}
        </main>
      </div>
    </div>
  )
}

function EmptyState({
  loading,
  onImport,
  onCreate,
}: {
  loading: boolean
  onImport: () => void
  onCreate: () => void
}) {
  return (
    <div className="max-w-md mx-auto mt-20 text-center space-y-6">
      <div className="text-6xl">🗂️</div>
      <h2 className="text-2xl font-semibold">欢迎使用 Tab It</h2>
      <p className="text-slate-500">选择一种方式开始整理你的书签</p>
      <div className="flex flex-col gap-3">
        <button onClick={onImport} disabled={loading} className="btn-primary py-3">
          {loading ? '导入中...' : '从浏览器一键导入书签'}
        </button>
        <button onClick={onCreate} className="btn-ghost py-3 border border-slate-200 dark:border-slate-700">
          创建空白分类
        </button>
      </div>
    </div>
  )
}
