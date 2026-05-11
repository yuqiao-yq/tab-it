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
  //   - linear/radial/conic-  → 直接当 background-image 使用
  //   - 其他（http/https/data:）→ 包成 url(...) 当背景图
  useEffect(() => {
    const body = document.body
    if (!wallpaper) {
      body.style.backgroundImage = ''
      body.style.backgroundSize = ''
      body.style.backgroundPosition = ''
      body.style.backgroundAttachment = ''
      return
    }
    const isGradient = /^(linear|radial|conic)-gradient\(/.test(wallpaper)
    body.style.backgroundImage = isGradient ? wallpaper : `url("${wallpaper}")`
    body.style.backgroundSize = 'cover'
    body.style.backgroundPosition = 'center'
    body.style.backgroundAttachment = 'fixed'
  }, [wallpaper])

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
