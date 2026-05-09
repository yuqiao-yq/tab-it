# Tab It - 开发路线图

## V1.0 - MVP（本地版）

**目标**：可用的本地书签整理新标签页，覆盖 80% 个人使用场景。

### 必做功能
- [x] 项目脚手架搭建（WXT + React + TS + Tailwind）
- [x] 接管浏览器 New Tab
- [ ] 读取浏览器原生书签（chrome.bookmarks）
- [ ] 自定义分类（创建、重命名、删除、排序）
- [ ] 卡片网格展示（favicon + 标题）
- [ ] 拖拽：卡片排序、跨分类移动（dnd-kit）
- [ ] 添加 / 编辑 / 删除卡片
- [ ] 搜索（标题 / URL 模糊匹配）
- [ ] 数据持久化（chrome.storage.local）
- [ ] JSON 导入导出（跨浏览器迁移兜底）
- [ ] 浅色 / 深色主题
- [ ] 中英文 i18n
- [ ] 上架 Chrome Web Store

### 加分功能
- [ ] 自定义壁纸
- [ ] 多布局切换（grid / list）
- [ ] 卡片大小调节
- [ ] 快捷键（搜索、新建等）
- [ ] 拖入链接快速添加
- [ ] 上架 Edge / Firefox Add-ons

---

## V1.5 - 同设备多浏览器同步

**目标**：用 chrome.storage.sync 同步轻量配置。

- [ ] 配置项（主题、布局）通过 storage.sync 跨设备同步
- [ ] 同步状态指示器
- [ ] 数据迁移工具（local → 云）

---

## V2.0 - 跨浏览器云同步

**目标**：实现 Chrome ↔ Edge ↔ Firefox 真正的数据互通。

### Free 套餐 - Google Drive
- [ ] OAuth 登录（chrome.identity / launchWebAuthFlow）
- [ ] DriveRepository 实现
- [ ] appdata folder 隐藏存储
- [ ] 增量同步 + 冲突合并（LWW 策略）
- [ ] 离线编辑队列

### Pro 套餐 - Supabase
- [ ] Supabase 项目搭建
- [ ] 账号系统（邮箱 + Google + GitHub）
- [ ] 实时订阅（多端实时同步）
- [ ] 端到端加密（用户密码派生密钥）
- [ ] 订阅管理（Stripe）

### 通用
- [ ] 同步冲突 UI 提示
- [ ] 同步历史与版本回滚

---

## V3.0 - 协作与智能化

- [ ] 分享分类（生成可访问链接）
- [ ] 团队协作（多人编辑）
- [ ] AI 自动分类（调用 LLM 给书签打标）
- [ ] 智能去重（相似 URL 识别）
- [ ] 网页快照（保存收藏时刻的页面截图）
- [ ] 浏览数据洞察（最常打开、长时间未访问等）

---

## 非功能性目标

- [ ] 启动时间 < 100ms
- [ ] 单元测试覆盖率 > 70%
- [ ] 包体积 < 500KB
- [ ] Lighthouse 性能分 > 90
