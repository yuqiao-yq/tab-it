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

      // 让用户明确选择：合并(默认/安全) vs 替换(清空原数据)
      // confirm 只能二选一，所以用两步：
      //   step1: 是否继续？显示数据量
      //   step2: 是否选择"替换全部"（取消则走合并）
      const ok = window.confirm(
        `检测到 ${cats.length} 个分类、${cards.length} 个书签。\n\n` +
          `点击"确定"继续导入，点击"取消"放弃。`,
      )
      if (!ok) return

      const replace = window.confirm(
        `请选择导入模式：\n\n` +
          `▸ 点击"确定" = 替换全部数据（清空本地所有分类与书签）\n` +
          `▸ 点击"取消" = 合并到现有数据（推荐，保留本地数据）`,
      )

      try {
        const result = await getRepository().bulkImport(
          data,
          replace ? 'replace' : 'merge',
        )
        await init()
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
        window.alert('导入失败：' + (err instanceof Error ? err.message : '未知错误'))
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
