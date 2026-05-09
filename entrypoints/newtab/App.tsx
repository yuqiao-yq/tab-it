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

  useEffect(() => {
    void init()
  }, [init])

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
