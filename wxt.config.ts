import { defineConfig } from 'wxt'

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: '.',
  outDir: '.output',
  // ─── 跨浏览器 manifest ─────────────────────────────
  // 用函数式 manifest 让 chrome / firefox 各自合法：
  // - chrome MV3：保留 'favicon' 权限（用于 chrome-extension://EXT_ID/_favicon/）
  // - firefox MV2：移除 'favicon'（不被支持，会触发 manifest 校验警告）
  manifest: ({ browser }) => ({
    name: 'Tab It - 书签整理新标签页',
    short_name: 'Tab It',
    description: '替代浏览器新标签页，DIY 你的个人书签整理面板',
    permissions: [
      'bookmarks',
      'storage',
      // 'history' 用于「最近使用」模块的「包含浏览器历史」可选功能
      // 默认关闭，用户在 UI 中主动开启后才会调用 history.search
      'history',
      ...(browser === 'chrome' ? ['favicon'] : []),
    ],
    chrome_url_overrides: {
      newtab: 'newtab.html',
    },
    action: {
      default_title: 'Tab It',
    },
  }),
  // 抑制 Firefox 2025-11 起新增的 data_collection_permissions 提示
  // （本扩展不收集任何用户数据，全部本地存储）
  // 真正发布到 AMO 时再补充正式声明
  // https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/
  suppressWarnings: {
    firefoxDataCollection: true,
  },
})
