import { useBookmarkStore } from '../stores/useBookmarkStore'
import { getRepository } from '../repositories'

export function Topbar() {
  const keyword = useBookmarkStore((s) => s.searchKeyword)
  const setKeyword = useBookmarkStore((s) => s.setSearchKeyword)
  const importFromBrowser = useBookmarkStore((s) => s.importFromBrowser)
  const init = useBookmarkStore((s) => s.init)

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
      try {
        const data = JSON.parse(text)
        await getRepository().bulkImport(data)
        await init()
        window.alert('导入成功')
      } catch (err) {
        window.alert('导入失败：文件格式错误')
      }
    }
    input.click()
  }

  return (
    <header className="flex items-center gap-3 px-4 py-3 border-b border-slate-200/60 dark:border-slate-700/60">
      <h1 className="text-lg font-semibold text-brand">Tab It</h1>
      <div className="flex-1 max-w-xl mx-auto">
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜索书签..."
          className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-800/60 backdrop-blur outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all"
        />
      </div>
      <div className="flex items-center gap-2">
        <button onClick={importFromBrowser} className="btn-ghost" title="从浏览器导入书签">
          ↓ 浏览器书签
        </button>
        <button onClick={handleImport} className="btn-ghost" title="导入 JSON">
          导入
        </button>
        <button onClick={handleExport} className="btn-ghost" title="导出 JSON">
          导出
        </button>
      </div>
    </header>
  )
}
