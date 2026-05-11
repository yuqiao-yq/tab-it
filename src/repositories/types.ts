import type {
  BookmarkCard,
  Category,
  ExportData,
  SyncResult,
  UserSettings,
} from '../types/bookmark'

/** 批量导入模式 */
export type BulkImportMode = 'merge' | 'replace'

/** 批量导入结果统计 */
export interface BulkImportResult {
  mode: BulkImportMode
  categoriesAdded: number
  categoriesUpdated: number
  cardsAdded: number
  cardsUpdated: number
}

/**
 * 存储抽象层接口
 *
 * 业务层只依赖此接口，便于在以下实现间切换/共存：
 * - LocalRepository（chrome.storage.local + IndexedDB）
 * - DriveRepository（Google Drive appdata，V2）
 * - SupabaseRepository（Supabase，V2）
 */
export interface BookmarkRepository {
  // ---------- 分类 ----------
  getCategories(): Promise<Category[]>
  saveCategory(cat: Category): Promise<void>
  /** 批量保存（避免并发"读-改-写"竞态） */
  saveCategories(cats: Category[]): Promise<void>
  deleteCategory(id: string): Promise<void>
  /** 批量删除分类（连同分类下卡片一并删除） */
  deleteCategories(ids: string[]): Promise<void>

  // ---------- 卡片 ----------
  getCards(categoryId?: string): Promise<BookmarkCard[]>
  saveCard(card: BookmarkCard): Promise<void>
  saveCards(cards: BookmarkCard[]): Promise<void>
  deleteCard(id: string): Promise<void>

  // ---------- 设置 ----------
  getSettings(): Promise<UserSettings>
  saveSettings(settings: UserSettings): Promise<void>

  // ---------- 批量 ----------
  /**
   * 批量导入数据。
   * - mode='merge'（默认，安全）：与本地数据合并，同 ID 取 updatedAt 更新者，新 ID 追加并重排 order；不覆盖本地 settings
   * - mode='replace'：完全替换本地数据（含 settings），慎用
   */
  bulkImport(data: ExportData, mode?: BulkImportMode): Promise<BulkImportResult>
  bulkExport(): Promise<ExportData>
  clear(): Promise<void>

  // ---------- 同步（V2 实现） ----------
  sync?(): Promise<SyncResult>
}
