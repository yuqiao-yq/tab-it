# Tab It - 架构与技术方案

> 一款替代浏览器新标签页（New Tab）的书签整理工具，支持 Chrome / Edge / Firefox / Brave / Opera 等主流浏览器。

---

## 1. 产品定位

- **核心场景**：用户打开新标签页时，看到的不是默认页面，而是自己整理好的、分类清晰的书签卡片墙。
- **核心价值**：
  1. 替代凌乱的浏览器原生书签栏
  2. 把书签按"个人项目 / 工作 / 学习 / 娱乐"等维度可视化分类
  3. 数据可在不同设备、不同浏览器之间互通
- **目标用户**：信息工作者、研究者、需要管理大量在线资源的人。

---

## 2. 技术栈选型

| 层 | 技术 | 选型理由 |
|---|---|---|
| 扩展规范 | **Manifest V3 + WebExtension API** | Chrome / Edge 强制 MV3，Firefox 已兼容，可一套代码多浏览器 |
| 脚手架 | **WXT** | 跨浏览器、自动生成 manifest、内置 HMR、零配置 |
| 框架 | **React 18 + TypeScript** | 生态最全，组件库丰富，类型安全 |
| 构建 | **Vite**（WXT 内置） | 快、HMR 体验好 |
| 样式 | **TailwindCSS** | 快速搭页面、产物体积小 |
| 状态管理 | **Zustand** | 轻量、API 直观，适合中小型应用 |
| 拖拽 | **@dnd-kit** | 比 react-dnd 更现代、a11y 友好 |
| 本地存储 | **chrome.storage.local + Dexie (IndexedDB)** | storage 存元数据，IndexedDB 存大数据（缩略图等） |
| 浏览器 API | **chrome.bookmarks / chrome.storage / favicon** | 原生书签读取与图标获取 |
| 跨浏览器同步（V2） | **Google Drive (appdata) + Supabase 双轨** | 免费用户用 Drive，Pro 用户用 Supabase 实时同步 |
| 跨浏览器兼容 | **webextension-polyfill** | 抹平 chrome.* 与 browser.* 差异 |

---

## 3. 整体架构

```
┌──────────────────────────────────────────────────┐
│         New Tab Page (entrypoints/newtab/)       │
│  ┌─────────────────────────────────────────┐     │
│  │   React App                             │     │
│  │   - 分类侧栏 / 卡片网格 / 拖拽          │     │
│  │   - 搜索 / 设置 / 主题                  │     │
│  └────────────────┬────────────────────────┘     │
│                   │                              │
│  ┌────────────────▼────────────────────────┐     │
│  │   Zustand Store（视图状态）             │     │
│  └────────────────┬────────────────────────┘     │
│                   │                              │
│  ┌────────────────▼────────────────────────┐     │
│  │   Repository 抽象层（统一数据 IO）       │     │
│  │   ┌────────┬─────────┬─────────────┐    │     │
│  │   │ Local  │ Browser │ Cloud(V2)   │    │     │
│  │   │Storage │Bookmarks│Drive/Supabase│   │     │
│  │   └────────┴─────────┴─────────────┘    │     │
│  └─────────────────────────────────────────┘     │
└──────────────────────────────────────────────────┘
            ▲
            │ chrome.* API
┌───────────┴──────────────────────────────────────┐
│   Background Service Worker                      │
│   - 监听 chrome.bookmarks 变化                   │
│   - 处理同步定时任务（V2）                        │
└──────────────────────────────────────────────────┘
```

### 关键模块

| 模块 | 路径 | 职责 |
|------|------|------|
| New Tab 页 | `entrypoints/newtab/` | 主界面，React 应用 |
| Background | `entrypoints/background.ts` | Service Worker，监听书签变化 |
| Popup（可选） | `entrypoints/popup/` | 点扩展图标的快捷面板 |
| Options（可选） | `entrypoints/options/` | 完整设置页 |
| 数据层 | `src/repositories/` | Repository 模式，封装存储 |
| 业务层 | `src/services/` | 书签同步、搜索、导入导出 |
| UI 层 | `src/components/` | 通用组件 |
| 状态 | `src/stores/` | Zustand stores |

---

## 4. 数据模型

> 设计原则：**视图层（自定义分类与卡片）与浏览器原生书签解耦**，避免在其他设备改了书签后破坏 DIY 布局。

```ts
// 自定义分类（独立于浏览器书签的虚拟分组）
interface Category {
  id: string                // uuid
  name: string
  icon?: string             // emoji 或图标名
  color?: string            // hex 色值
  order: number             // 排序
  createdAt: number
  updatedAt: number
}

// 卡片（一个书签的展示形态）
interface BookmarkCard {
  id: string                // uuid
  categoryId: string        // 所属分类
  title: string
  url: string
  icon?: string             // 用户自定义图标（默认用 favicon）
  thumbnail?: string        // 用户自定义缩略图（base64 或 URL）
  description?: string
  tags?: string[]
  order: number
  bookmarkId?: string       // 关联的浏览器原生书签 id（可选）
  createdAt: number
  updatedAt: number
}

// 用户设置
interface UserSettings {
  theme: 'light' | 'dark' | 'auto'
  layout: 'grid' | 'list'
  cardSize: 'sm' | 'md' | 'lg'
  wallpaper?: string
  language: 'zh-CN' | 'en'
  syncProvider?: 'local' | 'drive' | 'supabase'
}
```

### 同步预留字段
所有同步实体都带：
- `id`：全局唯一（uuid v4）
- `updatedAt`：最后更新时间戳，冲突合并用
- `deletedAt?`：软删除（同步时需要 tombstone）

---

## 5. 存储抽象层（Repository 模式）

为了在未来无痛切换/混用本地、Drive、Supabase，业务层只依赖统一接口：

```ts
interface BookmarkRepository {
  // 分类
  getCategories(): Promise<Category[]>
  saveCategory(cat: Category): Promise<void>
  deleteCategory(id: string): Promise<void>

  // 卡片
  getCards(categoryId?: string): Promise<BookmarkCard[]>
  saveCard(card: BookmarkCard): Promise<void>
  deleteCard(id: string): Promise<void>

  // 批量
  bulkImport(data: ExportData): Promise<void>
  bulkExport(): Promise<ExportData>

  // 同步（V2 实现）
  sync?(): Promise<SyncResult>
}
```

**实现类：**
- `LocalRepository`：基于 chrome.storage.local + Dexie（V1）
- `DriveRepository`：基于 Google Drive appdata（V2）
- `SupabaseRepository`：基于 Supabase（V2）

业务层通过依赖注入获取 Repository，**切换实现不影响 UI**。

---

## 6. 跨浏览器同步策略

### V1（MVP）：本地 + 导入导出
- 数据全部存 `chrome.storage.local`
- 提供 JSON 导入导出，作为跨浏览器迁移的兜底方案
- `chrome.storage.sync` 同步**轻量配置**（主题、布局等 < 100KB）

### V2：云端同步双轨
| 套餐 | 存储 | 用户成本 | 我方成本 |
|------|------|---------|---------|
| Free | Google Drive (appdata) | 0 | 0 |
| Pro | Supabase | 订阅费 | 用 Pro 收入抵消 |

**好处：**
1. 免费用户走 Drive，**永远不花我们的钱**
2. 付费用户走 Supabase，**收入覆盖成本**
3. Repository 抽象，业务代码完全不感知底层差异

### 冲突解决
- **Last-Write-Wins**（按 `updatedAt` 时间戳，简单粗暴）
- 进阶：CRDT（V3 再考虑）

---

## 7. 权限申请

```json
{
  "permissions": [
    "bookmarks",       // 读写浏览器原生书签
    "storage",         // 本地存储
    "favicon"          // 获取网站 favicon (MV3)
  ],
  "optional_permissions": [
    "identity"         // 同步登录用（仅 Pro 启用）
  ],
  "host_permissions": [],
  "chrome_url_overrides": {
    "newtab": "newtab.html"
  }
}
```

> 原则：**最小权限**。能不要的权限不要，能做成 optional 的就 optional，提升上架审核通过率与用户信任度。

---

## 8. 隐私与合规

1. **隐私政策**：上架必备，明确告知数据流向
2. **本地优先**：默认数据不离开本机
3. **云同步可选**：用户主动开启，明确知情
4. **端到端加密**（V2 Pro）：用户密码派生密钥，服务器只存密文
5. **GDPR**：提供数据导出与一键清除

---

## 9. 性能考量

- 卡片虚拟滚动（卡片 > 200 时启用 `react-virtuoso`）
- favicon 本地缓存（避免每次重新请求）
- 拖拽用 CSS transform，避免触发布局
- 启动时间目标：**< 100ms 首屏**

---

## 10. 测试策略

- 单元测试：Vitest（Repository、纯函数）
- 组件测试：Testing Library
- E2E：Playwright（加载扩展并模拟用户操作）
- 多浏览器矩阵：Chrome / Edge / Firefox 各跑一遍

---

## 11. 发布渠道

| 平台 | 费用 | 审核周期 |
|------|------|---------|
| Chrome Web Store | $5（一次性） | 1-3 天 |
| Microsoft Edge Add-ons | 免费 | 1-7 天 |
| Firefox Add-ons (AMO) | 免费 | 自动审核，敏感权限需人工 |
| Opera / Brave | 免费 | 直接装 Chrome 商店即可 |

---

## 12. 目录结构

```
tab-it/
├── docs/                    # 设计文档
├── entrypoints/             # WXT 入口
│   ├── newtab/              # 新标签页（主界面）
│   ├── background.ts        # Service Worker
│   ├── popup/               # 扩展图标弹出（可选）
│   └── options/             # 设置页（可选）
├── src/
│   ├── components/          # UI 组件
│   ├── stores/              # Zustand 状态
│   ├── repositories/        # 数据层（存储抽象）
│   ├── services/            # 业务逻辑
│   ├── types/               # 类型定义
│   ├── hooks/               # React hooks
│   ├── utils/               # 工具函数
│   └── styles/              # 全局样式
├── public/                  # 静态资源（图标等）
├── wxt.config.ts            # WXT 配置
├── tailwind.config.js
├── tsconfig.json
└── package.json
```
