import { useEffect, useMemo, useState } from 'react'
import {
  useAISettingsStore,
  PROVIDER_PRESETS,
  PROVIDER_GROUP_LABEL,
  type ProviderGroup,
} from '../../../ai/useAISettingsStore'
import { testConnection } from '../../../ai/manager'
import type { AIProviderConfig } from '../../../ai/types'
import { isAIConfigured } from '../../../ai/types'
import { cn } from '../../../utils/cn'
import { toast } from '../../../stores/useToastStore'
import { useBookmarkStore } from '../../../stores/useBookmarkStore'
import { useEmbedderStore } from '../../../ai/services/useEmbedderStore'
import {
  cleanOrphans,
  computeEmbedStatus,
  runEmbed,
  type EmbedStatus,
} from '../../../ai/services/embedder'
import { clearEmbeddings } from '../../../repositories/EmbeddingsDB'

/**
 * AI 设置 Tab
 *
 * 三段式布局：
 * 1. 顶部：总开关 + 隐私 / 本地优先选项
 * 2. 中间：Provider 列表（每条可改名 / 改路由 / 删除 / 测试连接）
 * 3. 底部：「+ 添加 Provider」展开预设选择 + 自定义表单
 *
 * Provider 详细字段使用展开折叠样式，避免长表单堆在一起。
 */
export function SettingsTab() {
  const settings = useAISettingsStore()
  const configured = isAIConfigured(settings)

  const [adding, setAdding] = useState(false)

  return (
    <div className="p-3 space-y-4 text-sm">
      {/* ─── 状态总览 ─── */}
      <div
        className={cn(
          'rounded-md px-3 py-2 text-xs',
          configured
            ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40'
            : 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40',
        )}
      >
        {configured ? (
          <>✓ AI 已就绪，可以开始使用整理 / 标签 / 对话等功能</>
        ) : (
          <>⚠ 还未配置可用的 AI Provider，下方添加一个即可开始</>
        )}
      </div>

      {/* ─── 总开关与隐私 ─── */}
      <section>
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
          通用
        </h4>
        <div className="space-y-1.5">
          <ToggleRow
            label="启用 AI 功能"
            description="关闭时所有 AI 入口（FAB / 浮窗 / popup ✨）都不工作"
            checked={settings.enabled}
            onChange={settings.setEnabled}
          />
          <ToggleRow
            label="匿名模式"
            description="发送给 AI 时只发域名，不发完整 URL"
            checked={settings.privacy.anonymousMode}
            onChange={(v) => settings.patchPrivacy({ anonymousMode: v })}
          />
          <ToggleRow
            label="操作前显示成本估算"
            description="每次 AI 操作前先确认本次大约消耗多少 tokens"
            checked={settings.privacy.showCostEstimate}
            onChange={(v) => settings.patchPrivacy({ showCostEstimate: v })}
          />
          <ToggleRow
            label="优先使用浏览器内置 AI"
            description="可用时优先走 Chrome 内置 Gemini Nano（仅 Chrome 138+）"
            checked={settings.preferLocal}
            onChange={settings.setPreferLocal}
          />
        </div>
      </section>

      {/* ─── Provider 列表 ─── */}
      <section>
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
          AI Provider
        </h4>
        {settings.providers.length === 0 ? (
          <div className="text-xs text-slate-400 px-2 py-3 text-center">
            还没有 Provider，点下方「+ 添加」开始
          </div>
        ) : (
          <div className="space-y-2">
            {settings.providers.map((p) => (
              <ProviderRow key={p.id} config={p} />
            ))}
          </div>
        )}

        {!adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className={cn(
              'mt-2 w-full py-1.5 rounded-md text-xs font-medium',
              'border border-dashed border-slate-300 dark:border-slate-600',
              'text-slate-500 dark:text-slate-400',
              'hover:border-brand hover:text-brand transition-colors',
            )}
          >
            + 添加 Provider
          </button>
        ) : (
          <AddProviderForm
            onClose={() => setAdding(false)}
            onAdded={() => setAdding(false)}
          />
        )}
      </section>

      {/* ─── 路由（任务 → Provider） ─── */}
      {settings.providers.length >= 2 && (
        <section>
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
            任务路由
          </h4>
          <p className="text-[11px] text-slate-400 mb-2">
            可以为不同任务指定不同 Provider，例如对话用强模型，整理 / 标签用便宜模型
          </p>
          <div className="space-y-1.5">
            <RouteRow task="chat" label="对话 / 总结" />
            <RouteRow task="organize" label="整理 / 分类" />
            <RouteRow task="embedding" label="Embedding" />
          </div>
        </section>
      )}

      {/* ─── Embedding 管理（V1.5 §5.1 语义搜索） ─── */}
      {configured && <EmbeddingSection />}

      <p className="text-[11px] text-slate-400 leading-relaxed">
        🔒 你的 API Key 仅保存在本机 chrome.storage.local，永不上传，
        也不会出现在导出的 JSON 数据里。
      </p>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
 * Embedding 管理 section（§5.1）
 *
 * 状态展示 + 三个动作：
 * - 「补缺」：仅为缺失 / stale 的卡片生成（增量、低成本，推荐）
 * - 「全部重生成」：清空整库后从头跑（切换模型 / 大改后用）
 * - 「清空」：删除所有 embedding（不会再走语义搜索）
 *
 * 进度态用 useEmbedderStore 跟踪，可中途取消。
 * ───────────────────────────────────────────────────────────── */

function EmbeddingSection() {
  const settings = useAISettingsStore()
  const cards = useBookmarkStore((s) => s.cards)
  const stage = useEmbedderStore((s) => s.stage)
  const progress = useEmbedderStore((s) => s.progress)
  const lastResult = useEmbedderStore((s) => s.lastResult)
  const errorMessage = useEmbedderStore((s) => s.errorMessage)
  const start = useEmbedderStore((s) => s.start)
  const setProgress = useEmbedderStore((s) => s.setProgress)
  const finish = useEmbedderStore((s) => s.finish)
  const fail = useEmbedderStore((s) => s.fail)
  const cancel = useEmbedderStore((s) => s.cancel)
  const reset = useEmbedderStore((s) => s.reset)

  const [status, setStatus] = useState<EmbedStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(false)

  // 拉一次状态：mount 时 + 任务结束后 + cards / settings 变了
  // computeEmbedStatus 是异步，不能放在 useMemo 里
  useEffect(() => {
    let cancelled = false
    void (async () => {
      setStatusLoading(true)
      try {
        const s = await computeEmbedStatus(cards, settings)
        if (!cancelled) setStatus(s)
      } finally {
        if (!cancelled) setStatusLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // 任务从 running → done/error 时自动刷新状态
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, settings.providers, settings.routing.embedding, stage])

  const handleRun = async (mode: 'all' | 'missing') => {
    if (mode === 'all') {
      const ok = window.confirm(
        '确认全量重生成？这会清空当前所有 embedding 并重新调 API（按书签数量计费）。\n建议仅在切换 embedding 模型 / 大批量改了卡片后使用。',
      )
      if (!ok) return
    }
    const controller = new AbortController()
    start(mode, controller)
    try {
      const result = await runEmbed({
        mode,
        cards,
        settings,
        signal: controller.signal,
        onProgress: setProgress,
      })
      finish(result)
      if (result.errors.length > 0) {
        toast.warning(
          'Embedding 部分失败',
          `成功 ${result.saved} / ${result.generated} 条；${result.errors.length} 个批次失败`,
        )
      } else if (result.saved > 0) {
        toast.success(
          'Embedding 已生成',
          `${result.saved} 条 · model=${result.model}`,
        )
      } else {
        toast.info('无可生成项', '所有书签的 embedding 都已是最新')
      }
    } catch (err) {
      if (controller.signal.aborted) {
        reset()
        return
      }
      const msg = err instanceof Error ? err.message : '未知错误'
      fail(msg)
      toast.error('Embedding 任务失败', msg)
    }
  }

  const handleClear = async () => {
    const ok = window.confirm(
      '确认清空所有 embedding？清空后语义搜索会回退到普通 substring 搜索，直到再次生成。',
    )
    if (!ok) return
    await clearEmbeddings()
    toast.success('已清空', 'Embedding 库已重置')
    setStatus(null)
    reset()
  }

  const handleCleanOrphans = async () => {
    const removed = await cleanOrphans(cards)
    if (removed === 0) {
      toast.info('无孤立行', '所有 embedding 都对应着现有书签')
    } else {
      toast.success('已清理', `删掉 ${removed} 条孤立 embedding`)
    }
    reset()
  }

  const running = stage === 'running'
  const pct =
    progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <section>
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
        Embedding 管理
      </h4>
      <p className="text-[11px] text-slate-400 mb-2 leading-relaxed">
        生成后可在搜索框输入 <code className="font-mono text-slate-500">@ai 关键字</code> 跨标题/标签做语义搜索。
        新增 / 修改书签后会自动标记为待补，点「补缺」即可增量更新。
      </p>

      {/* 状态网格 */}
      <div
        className={cn(
          'rounded-md border p-2.5 text-xs',
          'bg-slate-50 dark:bg-slate-800/40',
          'border-slate-200 dark:border-slate-700',
        )}
      >
        {statusLoading && !status ? (
          <div className="text-slate-400 py-1">读取索引状态…</div>
        ) : status ? (
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            <StatRow label="书签总数" value={status.totalCards} />
            <StatRow
              label="已索引"
              value={status.indexedCards}
              tone={status.indexedCards === status.totalCards ? 'ok' : 'normal'}
            />
            <StatRow
              label="待补缺"
              value={status.missingCards}
              tone={status.missingCards > 0 ? 'warn' : 'ok'}
            />
            <StatRow
              label="内容已变 (stale)"
              value={status.staleCards}
              tone={status.staleCards > 0 ? 'warn' : 'ok'}
            />
            {status.mismatchCards > 0 && (
              <StatRow
                label="模型不一致"
                value={status.mismatchCards}
                tone="warn"
              />
            )}
            {status.orphanRows > 0 && (
              <StatRow label="孤立行" value={status.orphanRows} tone="warn" />
            )}
            {status.currentModel && (
              <div className="col-span-2 flex items-center justify-between gap-2 pt-1 mt-1 border-t border-slate-200 dark:border-slate-700/60">
                <span className="text-slate-400">使用模型</span>
                <span className="font-mono text-[10px] text-slate-500 dark:text-slate-300 truncate">
                  {status.currentModel}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="text-slate-400 py-1">暂无数据</div>
        )}
      </div>

      {/* 进度条（运行中） */}
      {running && (
        <div className="mt-2 rounded-md border border-brand/30 bg-brand/5 px-2.5 py-2 space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-brand font-medium">
              ✨ 正在生成 embedding…
            </span>
            <span className="tabular-nums text-slate-500">
              {progress.done} / {progress.total} ({pct}%)
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
            <div
              className="h-full bg-brand transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <button
            type="button"
            onClick={cancel}
            className="text-[10px] text-slate-400 hover:text-red-500"
          >
            取消任务
          </button>
        </div>
      )}

      {/* 错误条 */}
      {stage === 'error' && (
        <div className="mt-2 rounded-md border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-2.5 py-1.5 text-[11px] text-red-600 dark:text-red-300 break-words">
          {errorMessage}
          <button
            type="button"
            onClick={reset}
            className="ml-2 underline hover:no-underline"
          >
            知道了
          </button>
        </div>
      )}

      {/* 上次结果摘要 */}
      {stage === 'done' && lastResult && (
        <div className="mt-2 rounded-md border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-1.5 text-[11px] text-emerald-700 dark:text-emerald-300">
          ✓ 上次任务：成功 {lastResult.saved} / {lastResult.generated} 条
          {lastResult.errors.length > 0 && (
            <span className="text-amber-600 dark:text-amber-300">
              ，{lastResult.errors.length} 批失败
            </span>
          )}
        </div>
      )}

      {/* 操作按钮区 */}
      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
        <ActionBtn
          primary
          disabled={running || !status || status.missingCards + status.staleCards === 0}
          onClick={() => void handleRun('missing')}
          title={
            status && status.missingCards + status.staleCards === 0
              ? '所有 embedding 都已是最新'
              : '为缺失 / 内容变化的卡片生成 embedding'
          }
        >
          ✨ 补缺
          {status && status.missingCards + status.staleCards > 0 && (
            <span className="ml-1 tabular-nums opacity-80">
              ({status.missingCards + status.staleCards})
            </span>
          )}
        </ActionBtn>
        <ActionBtn
          disabled={running || !status || status.totalCards === 0}
          onClick={() => void handleRun('all')}
          title="清空后从头跑（切换模型 / 大改时用）"
        >
          全部重生成
        </ActionBtn>
        {status && status.orphanRows > 0 && (
          <ActionBtn
            disabled={running}
            onClick={() => void handleCleanOrphans()}
            title="删除已被删除卡片对应的孤立 embedding 行"
          >
            清理孤立 ({status.orphanRows})
          </ActionBtn>
        )}
        <div className="flex-1" />
        <ActionBtn
          danger
          disabled={running || !status || status.indexedCards === 0}
          onClick={() => void handleClear()}
          title="清空所有 embedding（不删书签本身）"
        >
          清空
        </ActionBtn>
      </div>
    </section>
  )
}

function StatRow({
  label,
  value,
  tone = 'normal',
}: {
  label: string
  value: number | string
  tone?: 'normal' | 'ok' | 'warn'
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span
        className={cn(
          'tabular-nums font-medium',
          tone === 'ok'
            ? 'text-emerald-600 dark:text-emerald-400'
            : tone === 'warn'
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-slate-700 dark:text-slate-200',
        )}
      >
        {value}
      </span>
    </div>
  )
}

function ActionBtn({
  children,
  onClick,
  disabled,
  primary,
  danger,
  title,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  primary?: boolean
  danger?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'h-7 px-2.5 inline-flex items-center justify-center rounded text-xs font-medium transition-colors',
        disabled
          ? 'bg-slate-100 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
          : primary
            ? 'bg-brand text-white hover:bg-brand-600'
            : danger
              ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 border border-red-200 dark:border-red-500/30'
              : 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-brand hover:text-brand',
      )}
    >
      {children}
    </button>
  )
}

/* ─────────────────────────────────────────────────────────────
 * 辅助组件：开关行
 * ───────────────────────────────────────────────────────────── */

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        'w-full flex items-start gap-3 p-2 rounded-md text-left',
        'hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors',
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm text-slate-700 dark:text-slate-200">{label}</div>
        {description && (
          <div className="text-[11px] text-slate-400 mt-0.5">{description}</div>
        )}
      </div>
      {/* iOS 风格开关 */}
      <span
        className={cn(
          'shrink-0 relative inline-block w-9 h-5 rounded-full transition-colors',
          checked ? 'bg-brand' : 'bg-slate-300 dark:bg-slate-600',
        )}
        aria-hidden
      >
        <span
          className={cn(
            'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-[18px]' : 'translate-x-0.5',
          )}
        />
      </span>
    </button>
  )
}

/* ─────────────────────────────────────────────────────────────
 * 辅助组件：Provider 行（折叠展开）
 * ───────────────────────────────────────────────────────────── */

function ProviderRow({ config }: { config: AIProviderConfig }) {
  const updateProvider = useAISettingsStore((s) => s.updateProvider)
  const removeProvider = useAISettingsStore((s) => s.removeProvider)
  const [open, setOpen] = useState(false)
  const [testing, setTesting] = useState(false)

  const handleTest = async () => {
    setTesting(true)
    try {
      const r = await testConnection(config)
      if (r.ok) {
        toast.success('连接正常', r.message)
      } else {
        // 失败提示可能很长（chrome://flags 步骤等），延长展示时间到 30s 让用户看完
        toast.error('连接失败', r.message, 30_000)
      }
    } finally {
      setTesting(false)
    }
  }

  const handleDelete = () => {
    if (window.confirm(`删除 Provider「${config.name}」？`)) {
      removeProvider(config.id)
    }
  }

  return (
    <div
      className={cn(
        'rounded-md border border-slate-200 dark:border-slate-700',
        'bg-white dark:bg-slate-800/40',
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="text-base leading-none">
          {config.type === 'window-ai' ? '🟢' : '☁'}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
            {config.name}
          </div>
          <div className="text-[11px] text-slate-400 truncate font-mono">
            {config.model}
          </div>
        </div>
        <button
          type="button"
          onClick={handleTest}
          disabled={testing}
          className={cn(
            'h-7 px-2.5 rounded text-xs',
            'border border-slate-200 dark:border-slate-600',
            'hover:border-brand hover:text-brand transition-colors',
            testing && 'opacity-50 cursor-wait',
          )}
        >
          {testing ? '测试中…' : '测试连接'}
        </button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            'w-7 h-7 inline-flex items-center justify-center rounded',
            'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200',
            'hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors',
            'transition-transform',
            open && 'rotate-180',
          )}
          title={open ? '收起' : '展开编辑'}
          aria-label="展开编辑"
        >
          ▾
        </button>
      </div>

      {open && (
        <div className="px-3 pb-3 space-y-2 border-t border-slate-100 dark:border-slate-700/60">
          <Field
            label="名称"
            value={config.name}
            onChange={(v) => updateProvider(config.id, { name: v })}
          />
          {config.type !== 'window-ai' && (
            <Field
              label="Base URL"
              value={config.baseURL ?? ''}
              onChange={(v) => updateProvider(config.id, { baseURL: v.trim() })}
              mono
            />
          )}
          {config.type !== 'window-ai' && (
            <Field
              label="API Key"
              value={config.apiKey ?? ''}
              onChange={(v) => updateProvider(config.id, { apiKey: v.trim() })}
              mono
              type="password"
              placeholder="sk-..."
            />
          )}
          <Field
            label="对话模型"
            value={config.model}
            onChange={(v) => updateProvider(config.id, { model: v.trim() })}
            mono
          />
          {config.type !== 'window-ai' && (
            <Field
              label="Embedding 模型"
              value={config.embeddingModel ?? ''}
              onChange={(v) =>
                updateProvider(config.id, { embeddingModel: v.trim() || undefined })
              }
              mono
              placeholder="可选；如 text-embedding-3-small"
            />
          )}
          <div className="flex items-center justify-end pt-1">
            <button
              type="button"
              onClick={handleDelete}
              className={cn(
                'h-7 px-2.5 rounded text-xs',
                'text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors',
              )}
            >
              删除 Provider
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
 * 添加 Provider 表单（预设 + 自定义）
 * ───────────────────────────────────────────────────────────── */

function AddProviderForm({
  onClose,
  onAdded,
}: {
  onClose: () => void
  onAdded: () => void
}) {
  const addProvider = useAISettingsStore((s) => s.addProvider)
  const [presetIdx, setPresetIdx] = useState(0)
  const preset = PROVIDER_PRESETS[presetIdx]
  const [name, setName] = useState(preset.name)
  const [baseURL, setBaseURL] = useState(preset.baseURL)
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(preset.defaultModel)

  // 按 group 重新组织预设，便于 select 用 optgroup 分组渲染
  const presetsByGroup = useMemo(() => {
    const order: ProviderGroup[] = ['cn', 'global', 'aggregator', 'local', 'experimental']
    const groups = order.map((g) => ({
      group: g,
      label: PROVIDER_GROUP_LABEL[g],
      items: PROVIDER_PRESETS.map((p, i) => ({ p, i })).filter(
        ({ p }) => p.group === g,
      ),
    }))
    return groups.filter((g) => g.items.length > 0)
  }, [])

  // 切预设时自动同步表单
  const switchPreset = (i: number) => {
    setPresetIdx(i)
    const p = PROVIDER_PRESETS[i]
    setName(p.name)
    setBaseURL(p.baseURL)
    setModel(p.defaultModel)
  }

  // 不需要 apiKey 的本地 / 自部署服务（启发式：默认 baseURL 含 localhost / 127 / YOUR_HOST）
  const isLocalLike =
    /localhost|127\.0\.0\.1|YOUR_HOST|YOUR_RESOURCE/i.test(preset.baseURL)

  const canAdd =
    name.trim().length > 0 &&
    model.trim().length > 0 &&
    (preset.type === 'window-ai' ||
      (baseURL.trim().length > 0 &&
        (isLocalLike || apiKey.trim().length > 0)))

  const handleAdd = () => {
    if (!canAdd) return
    addProvider({
      type: preset.type,
      name: name.trim(),
      baseURL: preset.type === 'window-ai' ? undefined : baseURL.trim(),
      apiKey: preset.type === 'window-ai' ? undefined : apiKey.trim() || undefined,
      model: model.trim(),
      embeddingModel: preset.defaultEmbeddingModel,
    })
    toast.success('已添加 Provider', name.trim())
    onAdded()
  }

  return (
    <div
      className={cn(
        'mt-2 p-3 rounded-md',
        'border border-slate-200 dark:border-slate-700',
        'bg-slate-50/50 dark:bg-slate-800/40',
        'space-y-2',
      )}
    >
      <div className="flex items-center justify-between">
        <h5 className="text-xs font-semibold text-slate-700 dark:text-slate-200">
          添加 Provider
        </h5>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
        >
          取消
        </button>
      </div>

      <div>
        <label className="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">
          预设
        </label>
        <select
          value={presetIdx}
          onChange={(e) => switchPreset(Number(e.target.value))}
          className={cn(
            'w-full px-2 py-1.5 text-sm rounded',
            'bg-white dark:bg-slate-900',
            'border border-slate-200 dark:border-slate-700',
            'outline-none focus:border-brand focus:ring-1 focus:ring-brand/30',
          )}
        >
          {presetsByGroup.map((g) => (
            <optgroup key={g.group} label={g.label}>
              {g.items.map(({ p, i }) => (
                <option key={p.name} value={i}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {/* 选定预设的描述 */}
        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
          {preset.description}
        </p>
      </div>

      <Field label="名称" value={name} onChange={setName} />
      {preset.type !== 'window-ai' && (
        <Field label="Base URL" value={baseURL} onChange={setBaseURL} mono />
      )}
      {preset.type !== 'window-ai' && (
        <Field
          label="API Key"
          value={apiKey}
          onChange={setApiKey}
          mono
          type="password"
          placeholder={isLocalLike ? '本地服务可留空' : 'sk-...'}
        />
      )}
      <Field label="模型" value={model} onChange={setModel} mono />

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={handleAdd}
          disabled={!canAdd}
          className={cn(
            'h-7 px-3 rounded text-xs font-medium',
            canAdd
              ? 'bg-brand text-white hover:bg-brand-600'
              : 'bg-slate-200 text-slate-400 dark:bg-slate-700 dark:text-slate-500 cursor-not-allowed',
          )}
        >
          添加
        </button>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
 * 路由行
 * ───────────────────────────────────────────────────────────── */

function RouteRow({
  task,
  label,
}: {
  task: 'chat' | 'organize' | 'embedding'
  label: string
}) {
  const providers = useAISettingsStore((s) => s.providers)
  const routing = useAISettingsStore((s) => s.routing)
  const setRoute = useAISettingsStore((s) => s.setRoute)
  const current = routing[task] ?? providers[0]?.id ?? ''

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-500 dark:text-slate-400 w-20 shrink-0">
        {label}
      </span>
      <select
        value={current}
        onChange={(e) => setRoute(task, e.target.value)}
        className={cn(
          'flex-1 px-2 py-1 text-xs rounded',
          'bg-white dark:bg-slate-900',
          'border border-slate-200 dark:border-slate-700',
          'outline-none focus:border-brand',
        )}
      >
        {providers.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} ({p.model})
          </option>
        ))}
      </select>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
 * 通用字段
 * ───────────────────────────────────────────────────────────── */

function Field({
  label,
  value,
  onChange,
  mono,
  type = 'text',
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  mono?: boolean
  type?: 'text' | 'password'
  placeholder?: string
}) {
  return (
    <div>
      <label className="text-[11px] text-slate-500 dark:text-slate-400 block mb-0.5">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        className={cn(
          'w-full px-2 py-1.5 text-sm rounded',
          'bg-white dark:bg-slate-900',
          'border border-slate-200 dark:border-slate-700',
          'outline-none focus:border-brand focus:ring-1 focus:ring-brand/30',
          mono && 'font-mono text-xs',
        )}
      />
    </div>
  )
}
