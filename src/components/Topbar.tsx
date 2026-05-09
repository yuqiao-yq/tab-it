import { useBookmarkStore } from '../stores/useBookmarkStore'
import { getRepository } from '../repositories'
import { WebSearchBox } from './WebSearchBox'

export function Topbar() {
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
