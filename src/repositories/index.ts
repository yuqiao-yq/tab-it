/**
 * Repository 入口
 *
 * 当前只提供 LocalRepository。
 * 后续 V2 加入 Drive/Supabase 时，在此处通过 settings.syncProvider 决定返回哪种实现。
 */
import { localRepo } from './LocalRepository'
import type { BookmarkRepository } from './types'

let _repo: BookmarkRepository = localRepo

export function getRepository(): BookmarkRepository {
  return _repo
}

export function setRepository(repo: BookmarkRepository) {
  _repo = repo
}

export type { BookmarkRepository } from './types'
