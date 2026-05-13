import { create } from 'zustand'
import { v4 as uuid } from 'uuid'

/**
 * 轻量 Toast 系统
 *
 * 设计取舍：
 * - 不引第三方（react-toastify / sonner）以保持 bundle 体积
 * - zustand 单 store，所有 entrypoint（newtab / popup）独立各自的内存
 * - 默认 right-top 堆叠，3s 自动消失；error 默认 5s（让用户有时间读完）
 * - 支持显式 dismiss 与多条同时存在
 *
 * 用法：
 *   useToastStore.getState().success('已导入', '新增 3 个分类')
 *   useToastStore.getState().error('导入失败', err.message)
 */

export type ToastKind = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: string
  kind: ToastKind
  title: string
  message?: string
  /** 自动消失时间（ms）；0 表示不自动消失，必须用户手动点 ✕ */
  duration: number
}

interface ToastState {
  toasts: Toast[]
  /** 通用入口；返回 toast id（可用于手动 dismiss） */
  show: (input: {
    kind: ToastKind
    title: string
    message?: string
    duration?: number
  }) => string
  dismiss: (id: string) => void
  /** 清空所有（少用，例如在某些路由切换时） */
  clear: () => void
  // 便捷别名 ──────────────────
  success: (title: string, message?: string, duration?: number) => string
  error: (title: string, message?: string, duration?: number) => string
  info: (title: string, message?: string, duration?: number) => string
  warning: (title: string, message?: string, duration?: number) => string
}

const DEFAULT_DURATION: Record<ToastKind, number> = {
  success: 3000,
  info: 3000,
  warning: 4000,
  error: 5000,
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  show({ kind, title, message, duration }) {
    const id = uuid()
    const finalDuration = duration ?? DEFAULT_DURATION[kind]
    set((s) => ({ toasts: [...s.toasts, { id, kind, title, message, duration: finalDuration }] }))
    if (finalDuration > 0) {
      // setTimeout 在 store 外层调度即可；toast 容器组件不依赖此 setTimeout
      setTimeout(() => get().dismiss(id), finalDuration)
    }
    return id
  },
  dismiss(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },
  clear() {
    set({ toasts: [] })
  },
  success(title, message, duration) {
    return get().show({ kind: 'success', title, message, duration })
  },
  error(title, message, duration) {
    return get().show({ kind: 'error', title, message, duration })
  },
  info(title, message, duration) {
    return get().show({ kind: 'info', title, message, duration })
  },
  warning(title, message, duration) {
    return get().show({ kind: 'warning', title, message, duration })
  },
}))

/**
 * 模块级便捷调用（不需要 hook 也能 fire toast）。
 * 在 store action / utility 等非组件代码中使用。
 */
export const toast = {
  success: (title: string, message?: string, duration?: number) =>
    useToastStore.getState().success(title, message, duration),
  error: (title: string, message?: string, duration?: number) =>
    useToastStore.getState().error(title, message, duration),
  info: (title: string, message?: string, duration?: number) =>
    useToastStore.getState().info(title, message, duration),
  warning: (title: string, message?: string, duration?: number) =>
    useToastStore.getState().warning(title, message, duration),
  dismiss: (id: string) => useToastStore.getState().dismiss(id),
}
