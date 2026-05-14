import { useEffect, useMemo, useRef, useState } from 'react'
import { useAIPanelStore } from '../../../ai/panel/usePanelStore'
import { useAISettingsStore } from '../../../ai/useAISettingsStore'
import { runChat, suggestChatTitle } from '../../../ai/services/chatter'
import { isAIConfigured } from '../../../ai/types'
import type { ChatMessage } from '../../../ai/types'
import { toast } from '../../../stores/useToastStore'
import { cn } from '../../../utils/cn'

/**
 * 「💬 对话」Tab —— V1 简化版
 *
 * 当前能力：
 * - 多轮聊天（无 RAG，纯通用对话）
 * - 流式输出 + 中止
 * - 自动从首条提问生成 tab 标题
 * - messages 持久化到 panel store 的 tab.state
 * - 复制单条消息 / 清空对话
 *
 * 暂未实现（V2 §6.2）：
 * - 检索本地书签 / 网页内容作为 context
 * - 引用来源标号 [1] [2]
 * - 多对话独立挂着（已支持，因为 tab 本身就是多份）
 */
export function ChatTab({ tabId }: { tabId: string }) {
  const settings = useAISettingsStore()
  const configured = isAIConfigured(settings)

  // 从 panel store 读 / 写 当前 tab 的对话历史
  const tab = useAIPanelStore((s) => s.tabs.find((t) => t.id === tabId))
  const patchTab = useAIPanelStore((s) => s.patchTab)
  const messages = (tab?.state?.messages as ChatMessage[] | undefined) ?? []

  // 当前流式中的"临时 assistant 消息"，未结束前不写 store
  const [streamingText, setStreamingText] = useState<string | null>(null)
  // ref 镜像最新流式文本：闭包里需要拿"中止时已积累的内容"，setState 是异步的
  const streamingTextRef = useRef<string | null>(null)
  streamingTextRef.current = streamingText
  const [input, setInput] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  const sending = streamingText !== null

  // 自动滚到底部
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages.length, streamingText])

  // 写入 messages 到 store + 联动 tab title
  const updateMessages = (next: ChatMessage[]) => {
    const newTitle =
      tab?.title === '对话' || !tab?.title || tab?.title === '新对话'
        ? suggestChatTitle(next)
        : undefined
    patchTab(tabId, {
      state: { ...(tab?.state ?? {}), messages: next },
      ...(newTitle ? { title: newTitle } : {}),
    })
  }

  const handleSend = async () => {
    const content = input.trim()
    if (!content || sending) return
    if (!configured) {
      toast.warning('请先配置 AI', '在「⚙ 设置」中添加一个 Provider')
      return
    }

    const userMsg: ChatMessage = { role: 'user', content }
    const nextMessages = [...messages, userMsg]
    updateMessages(nextMessages)
    setInput('')
    inputRef.current?.focus()

    setStreamingText('')
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const r = await runChat({
        // 加一条简短 system 引导
        messages: [
          {
            role: 'system',
            content:
              '你是一个友好、严谨的助手。回答精炼、有条理；涉及代码用 ``` 代码块，避免冗余客套。',
          },
          ...nextMessages,
        ],
        settings,
        signal: controller.signal,
        onDelta: (_, full) => setStreamingText(full),
      })
      // 落库
      const final: ChatMessage = { role: 'assistant', content: r.text }
      updateMessages([...nextMessages, final])
    } catch (err) {
      if (controller.signal.aborted) {
        // 用户主动中止：把已生成的部分作为 assistant 消息留下（用 ref 拿最新值）
        const partialText = streamingTextRef.current ?? ''
        if (partialText.trim().length > 0) {
          const partial: ChatMessage = {
            role: 'assistant',
            content: partialText + '\n\n_（已中止）_',
          }
          updateMessages([...nextMessages, partial])
        }
      } else {
        const msg = err instanceof Error ? err.message : '未知错误'
        toast.error('AI 回答失败', msg)
        // 删掉刚发的 user 消息让用户能编辑后重发
        updateMessages(messages)
        setInput(content)
      }
    } finally {
      setStreamingText(null)
      streamingTextRef.current = null
      abortRef.current = null
    }
  }

  const handleStop = () => {
    abortRef.current?.abort()
  }

  const handleClear = () => {
    if (messages.length === 0) return
    if (!window.confirm('清空当前对话？')) return
    updateMessages([])
  }

  const handleCopy = (text: string) => {
    void navigator.clipboard.writeText(text).then(
      () => toast.success('已复制'),
      () => toast.error('复制失败'),
    )
  }

  if (!configured) {
    return <NoAINotice />
  }

  // 当前 chat 路由对应的 Provider（用于 header 展示模型名 + 中文警告判断）
  const currentChatProvider =
    settings.providers.find(
      (p) => p.id === (settings.routing.chat ?? settings.providers[0]?.id),
    ) ?? null
  const isWindowAI = currentChatProvider?.type === 'window-ai'
  // 远程 Provider 列表（供"快速切换"用）
  const remoteProviders = settings.providers.filter((p) => p.type !== 'window-ai')
  const switchToRemote = (providerId: string) => {
    settings.setRoute('chat', providerId)
    toast.success(
      '已切换 chat 路由',
      settings.providers.find((p) => p.id === providerId)?.name ?? '',
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* 顶部：当前 Provider + 清空 */}
      <ChatHeader
        modelName={currentChatProvider?.model}
        canClear={messages.length > 0}
        onClear={handleClear}
      />

      {/* 中文场景的语言能力警告：Chrome Gemini Nano 仅 en/es/ja，
          中文输入会让模型按英文 token 空间瞎拼出乱码 */}
      {isWindowAI && (
        <ChineseLangWarning
          remoteProviders={remoteProviders.map((p) => ({
            id: p.id,
            label: `${p.name} (${p.model})`,
          }))}
          onSwitch={switchToRemote}
        />
      )}

      {/* 中间：消息流 */}
      <div ref={scrollRef} className="flex-1 overflow-auto px-3 py-3 space-y-3">
        {messages.length === 0 && streamingText === null ? (
          <EmptyHint />
        ) : (
          <>
            {messages.map((m, i) => (
              <Bubble
                key={i}
                role={m.role}
                content={m.content}
                onCopy={() => handleCopy(m.content)}
              />
            ))}
            {streamingText !== null && (
              <Bubble role="assistant" content={streamingText || '...'} streaming />
            )}
          </>
        )}
      </div>

      {/* 底部：输入区 */}
      <div
        className={cn(
          'border-t border-slate-200 dark:border-slate-700',
          'bg-slate-50/60 dark:bg-slate-800/40',
          'p-2 flex items-end gap-2',
        )}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // Cmd/Ctrl+Enter 发送；纯 Enter 换行（更适合多行问句）
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault()
              void handleSend()
            }
          }}
          placeholder={sending ? 'AI 正在回答…' : '输入消息，Cmd+Enter 发送'}
          rows={2}
          disabled={sending}
          className={cn(
            'flex-1 resize-none rounded-md px-2 py-1.5 text-sm',
            'bg-white dark:bg-slate-900',
            'border border-slate-200 dark:border-slate-700',
            'outline-none focus:border-brand focus:ring-1 focus:ring-brand/30',
            'placeholder:text-slate-400',
            'max-h-32',
          )}
          spellCheck={false}
        />
        {sending ? (
          <button
            type="button"
            onClick={handleStop}
            className={cn(
              'shrink-0 h-8 px-3 rounded-md text-xs font-medium',
              'bg-red-500 text-white hover:bg-red-600 transition-colors',
            )}
            title="停止生成"
          >
            停止
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!input.trim()}
            className={cn(
              'shrink-0 h-8 px-3 rounded-md text-xs font-medium transition-colors',
              input.trim()
                ? 'bg-brand text-white hover:bg-brand-600'
                : 'bg-slate-200 text-slate-400 dark:bg-slate-700 dark:text-slate-500 cursor-not-allowed',
            )}
            title="发送 (Cmd/Ctrl+Enter)"
          >
            发送
          </button>
        )}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
 * 子组件：Header / Empty / Bubble
 * ───────────────────────────────────────────────────────────── */

function ChatHeader({
  modelName,
  canClear,
  onClear,
}: {
  modelName?: string
  canClear: boolean
  onClear: () => void
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 shrink-0',
        'border-b border-slate-200 dark:border-slate-700',
        'text-[11px]',
      )}
    >
      <span className="text-slate-400">使用</span>
      <span className="font-mono text-slate-600 dark:text-slate-300">
        {modelName ?? '(未配置)'}
      </span>
      <div className="flex-1" />
      <button
        type="button"
        onClick={onClear}
        disabled={!canClear}
        className={cn(
          'h-6 px-2 rounded text-[11px]',
          canClear
            ? 'text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10'
            : 'text-slate-300 cursor-not-allowed',
        )}
      >
        清空
      </button>
    </div>
  )
}

function ChineseLangWarning({
  remoteProviders,
  onSwitch,
}: {
  remoteProviders: Array<{ id: string; label: string }>
  onSwitch: (providerId: string) => void
}) {
  const addTab = useAIPanelStore((s) => s.addTab)
  return (
    <div
      className={cn(
        'shrink-0 px-3 py-2 text-[11px] leading-relaxed',
        'bg-amber-50 dark:bg-amber-500/10',
        'text-amber-800 dark:text-amber-300',
        'border-b border-amber-200 dark:border-amber-800/40',
      )}
    >
      <div className="flex items-start gap-2">
        <span aria-hidden>⚠️</span>
        <div className="flex-1">
          <strong>Chrome 内置 AI 不支持中文输出</strong>
          ，仅支持 en / es / ja。中文提问会得到乱码（token 在英文空间瞎拼）。
          {remoteProviders.length > 0 ? (
            <span> 建议立即切换到远程 Provider：</span>
          ) : (
            <span> 请添加一个远程 Provider（DeepSeek / OpenAI / 智谱等）。</span>
          )}
        </div>
      </div>
      <div className="mt-1.5 ml-5 flex flex-wrap items-center gap-1.5">
        {remoteProviders.length > 0 ? (
          remoteProviders.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onSwitch(p.id)}
              className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded',
                'bg-amber-200/70 dark:bg-amber-500/20',
                'text-amber-900 dark:text-amber-200',
                'hover:bg-amber-300 dark:hover:bg-amber-500/30 transition-colors',
                'font-medium',
              )}
            >
              切换到 {p.label}
            </button>
          ))
        ) : (
          <button
            type="button"
            onClick={() => addTab('settings')}
            className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded',
              'bg-amber-200/70 dark:bg-amber-500/20',
              'text-amber-900 dark:text-amber-200',
              'hover:bg-amber-300 dark:hover:bg-amber-500/30 transition-colors',
              'font-medium',
            )}
          >
            前往设置添加 Provider
          </button>
        )}
      </div>
    </div>
  )
}

function EmptyHint() {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-2 text-center pt-4 text-slate-400">
      <div className="text-3xl">💬</div>
      <p className="text-xs leading-relaxed max-w-[260px]">
        和 AI 对话。当前是「通用聊天」模式，未读取你的书签内容。
        <br />
        V2.0 「问问我的书签库」上线后，AI 将能根据你收藏过的网页内容回答问题。
      </p>
    </div>
  )
}

function Bubble({
  role,
  content,
  streaming,
  onCopy,
}: {
  role: 'user' | 'assistant' | 'system'
  content: string
  streaming?: boolean
  onCopy?: () => void
}) {
  if (role === 'system') return null
  const isUser = role === 'user'
  return (
    <div
      className={cn(
        'group flex gap-2',
        isUser ? 'justify-end' : 'justify-start',
      )}
    >
      {!isUser && (
        <span
          className={cn(
            'shrink-0 w-6 h-6 rounded-full inline-flex items-center justify-center text-xs',
            'bg-brand/10 text-brand',
          )}
          aria-hidden
        >
          ✨
        </span>
      )}
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed',
          'whitespace-pre-wrap break-words',
          isUser
            ? 'bg-brand text-white rounded-tr-sm'
            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-tl-sm',
        )}
      >
        <RichText content={content} />
        {streaming && (
          <span className="inline-block w-1.5 h-3.5 bg-current ml-0.5 animate-pulse align-text-bottom" />
        )}
      </div>
      {!isUser && onCopy && !streaming && (
        <button
          type="button"
          onClick={onCopy}
          className={cn(
            'shrink-0 self-start mt-1 w-6 h-6 inline-flex items-center justify-center rounded',
            'text-slate-400 hover:text-brand',
            'opacity-0 group-hover:opacity-100 transition-opacity',
            'hover:bg-slate-100 dark:hover:bg-slate-700/60',
          )}
          title="复制"
          aria-label="复制"
        >
          ⎘
        </button>
      )}
    </div>
  )
}

/**
 * 极简 markdown 渲染：保留换行 + 抽出 ``` 代码块。
 * 完整 markdown 引用 react-markdown 会增加 ~50KB 体积，V1 阶段先这样。
 */
function RichText({ content }: { content: string }) {
  const parts = useMemo(() => splitCodeBlocks(content), [content])
  return (
    <>
      {parts.map((p, i) =>
        p.type === 'code' ? (
          <pre
            key={i}
            className={cn(
              'my-1.5 px-2.5 py-1.5 rounded text-[12px] font-mono leading-snug overflow-x-auto',
              'bg-slate-900 text-slate-100',
              'border border-slate-700',
            )}
          >
            {p.lang && (
              <div className="text-[10px] text-slate-400 mb-1">{p.lang}</div>
            )}
            <code>{p.text}</code>
          </pre>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  )
}

type Part = { type: 'text' | 'code'; text: string; lang?: string }

function splitCodeBlocks(text: string): Part[] {
  const parts: Part[] = []
  const re = /```(\w+)?\n?([\s\S]*?)```/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      parts.push({ type: 'text', text: text.slice(last, m.index) })
    }
    parts.push({ type: 'code', lang: m[1], text: m[2].replace(/\n$/, '') })
    last = m.index + m[0].length
  }
  if (last < text.length) {
    parts.push({ type: 'text', text: text.slice(last) })
  }
  return parts.length > 0 ? parts : [{ type: 'text', text }]
}

/* ─────────────────────────────────────────────────────────────
 * 通用：未配置 AI 提示
 * ───────────────────────────────────────────────────────────── */

function NoAINotice() {
  const addTab = useAIPanelStore((s) => s.addTab)
  return (
    <div className="h-full flex flex-col items-center justify-center p-6 gap-3 text-center">
      <div className="text-5xl">⚙</div>
      <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200">
        请先配置 AI Provider
      </h3>
      <p className="text-xs text-slate-500 dark:text-slate-400 max-w-[280px]">
        对话需要至少一个可用的 LLM Provider（DeepSeek / OpenAI / Moonshot 等）。
      </p>
      <button
        type="button"
        onClick={() => addTab('settings')}
        className="mt-2 h-8 px-4 rounded-md text-xs bg-brand text-white hover:bg-brand-600"
      >
        前往设置
      </button>
    </div>
  )
}
