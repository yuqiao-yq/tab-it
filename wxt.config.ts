import { defineConfig } from 'wxt'

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: '.',
  outDir: '.output',
  manifest: {
    name: 'Tab It - 书签整理新标签页',
    short_name: 'Tab It',
    description: '替代浏览器新标签页，DIY 你的个人书签整理面板',
    permissions: ['bookmarks', 'storage', 'favicon'],
    chrome_url_overrides: {
      newtab: 'newtab.html',
    },
    action: {
      default_title: 'Tab It',
    },
  },
})
