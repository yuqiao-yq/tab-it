# Tab It

> 替代浏览器新标签页的书签整理工具，支持 Chrome / Edge / Firefox / Brave / Opera。

打开新标签页，看到的不是默认页面，而是你自己整理好的、分类清晰的书签卡片墙。

## 特性

- 🎨 **DIY 新标签页**：自定义分类 + 卡片网格
- 🖱️ **拖拽排序**：卡片可在分类内或跨分类拖拽
- 🔍 **快速搜索**：按标题 / URL 实时过滤
- 📥 **一键导入**：从浏览器原生书签批量导入
- 💾 **数据自由**：JSON 导入 / 导出，跨浏览器迁移
- 🌗 **深色模式**：自动跟随系统
- 🔌 **跨浏览器**：一套代码，多浏览器通用（基于 WebExtension）
- ☁️ **云同步**（V2 规划中）：Google Drive 免费 / Supabase 付费双轨

## 技术栈

- **WXT** + **React 18** + **TypeScript** + **Vite**
- **TailwindCSS** 3
- **Zustand**（状态管理）
- **@dnd-kit**（拖拽）
- **chrome.bookmarks / chrome.storage / favicon API**

## 目录结构

```
tab-it/
├── docs/                   # 设计文档（架构、Roadmap）
├── entrypoints/
│   ├── newtab/             # 新标签页主界面
│   └── background.ts       # Service Worker
├── src/
│   ├── components/         # UI 组件
│   ├── stores/             # Zustand 状态
│   ├── repositories/       # 数据层（存储抽象）
│   ├── services/           # 业务逻辑（导入等）
│   ├── types/              # 类型定义
│   ├── utils/              # 工具函数
│   └── styles/             # 全局样式
├── wxt.config.ts
├── tailwind.config.js
└── package.json
```

## 开发指南

### 1. 安装依赖

```bash
pnpm install
```

> 推荐使用 pnpm。npm / yarn 也可以。

### 2. 启动开发模式

```bash
# Chromium（Chrome / Edge / Brave / Opera）
pnpm dev

# Firefox
pnpm dev:firefox
```

WXT 会自动启动浏览器并加载扩展，支持 HMR。

### 3. 手动加载（如果不用 WXT 自动启动）

```bash
pnpm build
```

#### Chrome / Edge
1. 打开 `chrome://extensions/`（或 `edge://extensions/`）
2. 开启右上角的 **开发者模式**
3. 点击 **加载已解压的扩展程序**
4. 选择项目下的 `.output/chrome-mv3` 目录
5. 打开新标签页即可看到 Tab It 界面

#### Firefox
1. 打开 `about:debugging#/runtime/this-firefox`
2. 点击 **临时载入附加组件**
3. 选择 `.output/firefox-mv3/manifest.json`

### 4. 打包发布

```bash
pnpm build       # Chrome 产物：.output/chrome-mv3
pnpm zip         # 生成上架用 zip：.output/*.zip

pnpm build:firefox
pnpm zip:firefox
```

## 使用说明

打开新标签页后：

1. **首次使用**：点击 "从浏览器一键导入书签" 把现有书签导入
2. **创建分类**：左侧栏点击 `+` 新建分类
3. **添加卡片**：在分类内点击卡片网格里的 `+` 添加单条
4. **拖拽排序**：按住卡片拖动调整顺序
5. **搜索**：顶部搜索框实时过滤
6. **导入导出**：顶部菜单可备份 / 恢复全部数据（跨浏览器迁移用）

## 路线图

详见 [docs/ROADMAP.md](docs/ROADMAP.md)。

- **V1.0** - 本地版 MVP（当前）
- **V1.5** - 同浏览器多设备同步（chrome.storage.sync）
- **V2.0** - 跨浏览器云同步（Drive Free + Supabase Pro）
- **V3.0** - 协作 / 分享 / AI 自动分类

## 架构与设计

详见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

核心设计：
- **Repository 模式**：存储层抽象，未来切换到云端不影响业务代码
- **视图与原生书签解耦**：自定义分类独立存在，不受浏览器原生书签变动影响
- **同步预留**：所有实体带 `id` + `updatedAt`，便于 V2 冲突合并

## License

MIT
