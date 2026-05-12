/**
 * 核心数据模型
 *
 * 设计原则：
 * - 视图层（Category + BookmarkCard）与浏览器原生书签解耦
 * - 所有同步实体带 id / updatedAt，便于 V2 云同步冲突合并
 */

/** 自定义分类（虚拟分组） */
export interface Category {
  id: string
  name: string
  icon?: string   // emoji 或图标名
  color?: string  // hex 色值
  /** 用户自定义备注/描述（与书签卡同款 UX，鼠标 hover 时可添加） */
  description?: string
  /** 父分类 ID；undefined 或空字符串表示顶层 */
  parentId?: string
  order: number
  createdAt: number
  updatedAt: number
}

/** 卡片：一个书签的展示形态 */
export interface BookmarkCard {
  id: string
  categoryId: string
  title: string
  url: string
  /** 用户自定义图标（缺省用 favicon） */
  icon?: string
  /** 用户自定义缩略图（base64 / URL） */
  thumbnail?: string
  description?: string
  tags?: string[]
  order: number
  /** 关联的浏览器原生书签 id */
  bookmarkId?: string
  createdAt: number
  updatedAt: number
}

/** 用户设置 */
export interface UserSettings {
  theme: 'light' | 'dark' | 'auto'
  layout: 'grid' | 'list'
  cardSize: 'sm' | 'md' | 'lg'
  wallpaper?: string
  language: 'zh-CN' | 'en'
  syncProvider: 'local' | 'drive' | 'supabase'
  /**
   * 左侧分类栏宽度（px）。
   * 取值范围参考 SIDEBAR_WIDTH_MIN / SIDEBAR_WIDTH_MAX，
   * 默认值见 SIDEBAR_WIDTH_DEFAULT。折叠态由组件内 collapsed 状态控制，
   * 不写入此字段，避免折叠后丢失展开时的偏好。
   */
  sidebarWidth?: number
  /**
   * 「最近使用」模块是否合并展示浏览器全局历史（任意网站）。
   * - false（默认）：只展示用户在本扩展内点击过的书签卡片
   * - true        ：再叠加 browser.history.search 的结果
   * 隐私敏感，默认关闭，需要用户在 UI 中主动开启。
   */
  recentIncludeBrowserHistory?: boolean
}

/** 左侧分类栏宽度边界（与 CategorySidebar 中的拖拽限制保持一致） */
export const SIDEBAR_WIDTH_MIN = 180
export const SIDEBAR_WIDTH_MAX = 480
export const SIDEBAR_WIDTH_DEFAULT = 240

/** 导入导出数据 */
export interface ExportData {
  version: string
  exportedAt: number
  categories: Category[]
  cards: BookmarkCard[]
  settings?: UserSettings
}

/** 同步结果（V2 用） */
export interface SyncResult {
  success: boolean
  pulled: number
  pushed: number
  conflicts: number
  message?: string
}

export const DEFAULT_SETTINGS: UserSettings = {
  theme: 'auto',
  layout: 'grid',
  cardSize: 'md',
  language: 'zh-CN',
  syncProvider: 'local',
}
