'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { SignOutButton } from '@/components/auth-buttons'
import {
  Activity,
  ArrowUp,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  Command,
  FileText,
  Globe2,
  LoaderCircle,
  LockKeyhole,
  Mail,
  MessageCircle,
  Mic,
  MoreHorizontal,
  Play,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  UserRound,
  Volume2,
  Wrench,
  X,
} from 'lucide-react'

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition
    webkitSpeechRecognition?: new () => SpeechRecognition
  }
}

type SpeechRecognitionEvent = {
  results: SpeechRecognitionResultList
  resultIndex: number
}

type SpeechRecognition = {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
}

export type TerminalUser = {
  id: string | null
  name: string | null
  email: string | null
  image: string | null
}

type MessageRole = 'user' | 'nexus' | 'system'
type Message = {
  id: string
  role: MessageRole
  content: string
  meta?: string
}

type ActivityEntry = {
  id: string
  time: string
  title: string
  detail: string
  kind?: string
  conversationId?: string
}

type Task = {
  id: string
  title: string
  status: 'queued' | 'in_progress' | 'completed'
  dueAt?: string
  createdAt: string
  conversationId?: string | null
}

type PendingApproval = {
  id: string
  toolName: string
  summary?: { to?: string; subject?: string; message?: string; title?: string; description?: string }
}

type ApiState = {
  tasks: Task[]
  activity: ActivityEntry[]
  pendingApprovals: PendingApproval[]
}

type Integration = {
  name: string
  detail: string
  state: 'connected' | 'not_connected' | 'expired'
}

type ConversationSummary = {
  id: string
  title: string | null
  createdAt: string
  updatedAt: string
  preview?: string
}

const DEFAULT_CONV_ID = ''

const nowFmt = () =>
  new Intl.DateTimeFormat('en', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  }).format(new Date())

const mid = (prefix = 'm') => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`

type EngineEvent =
  | { type: 'thinking' }
  | { type: 'text'; content: string }
  | { type: 'tool_call'; toolName: string; input: unknown }
  | { type: 'tool_result'; toolName: string; ok: boolean; data?: unknown; error?: string }
  | {
      type: 'approval_requested'
      approvalId: string
      toolName: string
      summary: Record<string, string | undefined>
    }
  | { type: 'approval_resolved'; approvalId: string; status: 'APPROVED' | 'REJECTED' }
  | { type: 'assistant'; content: string }
  | { type: 'error'; message: string }
  | { type: 'done' }

function activityVisual(a: { title: string; kind?: string; detail?: string }): {
  Icon: typeof Activity
  dot: string
  tone: string
} {
  const text = `${a.title} ${a.detail ?? ''}`.toLowerCase()
  if (text.includes('approval')) {
    return { Icon: ShieldCheck, dot: 'bg-amber-500', tone: 'text-amber-600' }
  }
  if (text.includes('tool') || text.includes('whatsapp')) {
    return { Icon: Wrench, dot: text.includes('failed') ? 'bg-rose-500' : 'bg-sky-500', tone: 'text-sky-600' }
  }
  if (text.includes('task') || text.includes('email') || text.includes('calendar')) {
    return { Icon: Check, dot: 'bg-emerald-500', tone: 'text-emerald-600' }
  }
  return { Icon: Activity, dot: 'bg-muted-foreground/60', tone: 'text-muted-foreground' }
}

export function NexusTerminal({ user }: { user: TerminalUser }) {
  const [messages, setMessages] = useState<Message[]>([
    { id: mid(), role: 'nexus', content: "I'll help you get things done — schedule events, manage your calendar, send and search emails, send WhatsApp messages, create tasks, and search the web.", meta: 'Nexus · welcome' },
  ])
  const [command, setCommand] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [conversationId, setConversationId] = useState<string>(DEFAULT_CONV_ID)
  const [activity, setActivity] = useState<ActivityEntry[]>([
    { id: 'seed1', time: nowFmt(), title: 'Conversation opened', detail: 'New session' },
  ])
  const [tasks, setTasks] = useState<Task[]>([])
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([])
  const [history, setHistory] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState<'activity' | 'tasks'>('activity')
  const [globalActivity, setGlobalActivity] = useState<ActivityEntry[]>([])
  const [globalTasks, setGlobalTasks] = useState<Task[]>([])
  const [panelModal, setPanelModal] = useState<'activity' | 'tasks' | null>(null)
  const [expandedActivities, setExpandedActivities] = useState<Set<string>>(new Set())

  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [voiceTranscript, setVoiceTranscript] = useState('')
  const [voiceSupported, setVoiceSupported] = useState(() =>
    typeof window === 'undefined'
      ? true
      : Boolean(typeof window.SpeechRecognition !== 'undefined' || typeof window.webkitSpeechRecognition !== 'undefined'),
  )
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [conversationsLoaded, setConversationsLoaded] = useState(false)
  const [conversationSearch, setConversationSearch] = useState('')
  const messagesRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/integrations', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (alive && json?.integrations) setIntegrations(json.integrations)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    void refreshConversations()
    void refreshGlobalPanels()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-scroll the conversation to the latest message whenever it updates.
  useEffect(() => {
    const el = messagesRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  // Refresh all-conversation activity/tasks whenever the modal is opened.
  useEffect(() => {
    if (panelModal) void refreshGlobalPanels()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelModal])

  // Load per-conversation state (activity/tasks/approvals for the selected conversation)
  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch(`/api/state?conversationId=${encodeURIComponent(conversationId)}`, { cache: 'no-store' })
        if (!res.ok) return
        const json = (await res.json()) as { ok: boolean; conversationId: string; state: ApiState }
        if (json.ok && json.state) {
          setActivity(Array.isArray(json.state.activity) ? json.state.activity : [])
          if (Array.isArray(json.state.tasks)) setTasks(json.state.tasks)
          if (Array.isArray(json.state.pendingApprovals)) setPendingApprovals(json.state.pendingApprovals)
        }
      } catch {
        /* no-op, offline graceful */
      }
    })()
  }, [conversationId])

  async function loadConversation(convId: string) {
    try {
      const res = await fetch(`/api/state?conversationId=${encodeURIComponent(convId)}`, { cache: 'no-store' })
      if (!res.ok) return
      const json = (await res.json()) as { ok: boolean; conversationId: string; state: ApiState & { messages?: unknown[] } }
      if (json.ok && json.state) {
        setConversationId(convId)
        const mapped: Message[] = (json.state.messages ?? [])
          .map((m) => {
            const role = (m as { role?: string }).role
            if (role === 'assistant') {
              return { id: (m as { id: string }).id ?? mid('n'), role: 'nexus', content: (m as { content?: string }).content ?? '' }
            }
            if (role === 'user') {
              return { id: (m as { id: string }).id ?? mid('u'), role: 'user', content: (m as { content?: string }).content ?? '' }
            }
            if (role === 'system') {
              return { id: (m as { id: string }).id ?? mid('sys'), role: 'system', content: (m as { content?: string }).content ?? '' }
            }
            return null // skip tool/internal messages in the conversation view
          })
          .filter((m): m is Message => m !== null)
        setMessages(mapped.length ? mapped : [{ id: mid(), role: 'nexus', content: 'This conversation is empty. Ask me anything.', meta: 'Nexus' }])
        setHistory([])
        if (Array.isArray(json.state.tasks)) setTasks(json.state.tasks)
        if (Array.isArray(json.state.pendingApprovals)) setPendingApprovals(json.state.pendingApprovals)
        if (Array.isArray(json.state.activity)) setActivity(json.state.activity)
      }
    } catch {
      /* no-op */
    }
  }

  async function refreshConversations() {
    try {
      const res = await fetch('/api/state', { cache: 'no-store' })
      if (!res.ok) return
      const json = (await res.json()) as { ok: boolean; conversations?: ConversationSummary[] }
      if (json.ok && Array.isArray(json.conversations)) {
        setConversations(json.conversations)
      }
    } catch {
      /* no-op */
    } finally {
      setConversationsLoaded(true)
    }
  }

  async function refreshGlobalPanels() {
    try {
      const [tasksRes, activityRes] = await Promise.all([
        fetch('/api/tasks', { cache: 'no-store' }),
        fetch('/api/activity', { cache: 'no-store' }),
      ])
      if (tasksRes.ok) {
        const json = (await tasksRes.json()) as { ok: boolean; tasks?: Task[] }
        if (json.ok && Array.isArray(json.tasks)) setGlobalTasks(json.tasks)
      }
      if (activityRes.ok) {
        const json = (await activityRes.json()) as { ok: boolean; activity?: ActivityEntry[] }
        if (json.ok && Array.isArray(json.activity)) {
          setGlobalActivity(json.activity)
          setExpandedActivities(new Set(json.activity.map((a) => a.id)))
        }
      }
    } catch {
      /* no-op */
    }
  }

  function newConversation() {
    const newId = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    setConversationId(newId)
    setMessages([
      {
        id: mid(),
        role: 'nexus',
        content: "New conversation. What can I help with? Try 'help' to see capabilities.",
        meta: 'Nexus · new session',
      },
    ])
    setTasks([])
    setActivity([{ id: mid('a'), time: nowFmt(), title: 'Conversation opened', detail: 'New session' }])
    setPendingApprovals([])
    setHistory([])
  }

  // Speech recognition + synthesis setup
  useEffect(() => {
    const SpeechRecognitionAPI = typeof window === 'undefined' ? null : window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognitionAPI) {
      return
    }
    const recognition = new SpeechRecognitionAPI()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join('')
      setVoiceTranscript(transcript)
      if (event.results[event.results.length - 1].isFinal) {
        void submitCommand(transcript)
      }
    }
    recognition.onend = () => setIsListening(false)
    recognition.onerror = () => setIsListening(false)
    recognitionRef.current = recognition
    return () => {
      try {
        recognition.stop()
      } catch {
        /* ignore */
      }
      if (typeof window !== 'undefined') window.speechSynthesis?.cancel()
    }
  }, [])

  function speak(text: string) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    try {
      window.speechSynthesis.cancel()
      const utter = new SpeechSynthesisUtterance(text)
      setIsSpeaking(true)
      utter.onend = () => setIsSpeaking(false)
      utter.onerror = () => setIsSpeaking(false)
      window.speechSynthesis.speak(utter)
    } catch {
      setIsSpeaking(false)
    }
  }

  function stopSpeaking() {
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel()
    setIsSpeaking(false)
  }

  function toggleVoice() {
    if (!voiceSupported) return
    stopSpeaking()
    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
      return
    }
    setVoiceTranscript('')
    try {
      recognitionRef.current?.start()
      setIsListening(true)
    } catch {
      setIsListening(false)
    }
  }

  function mergeServerState(state: ApiState | undefined) {
    if (!state) return
    if (Array.isArray(state.tasks)) setTasks(state.tasks)
    if (Array.isArray(state.activity) && state.activity.length > 0) {
      setActivity((prev) => {
        const seen = new Set(prev.map((a) => a.id))
        const extras = state.activity.filter((a) => !seen.has(a.id))
        return [...extras, ...prev]
      })
    }
    if (Array.isArray(state.pendingApprovals)) setPendingApprovals(state.pendingApprovals)
  }

  async function submitCommand(rawValue?: string) {
    const value = (rawValue !== undefined ? rawValue : command).trim()
    if (!value || isBusy) return
    setIsBusy(true)
    const userMsgId = mid('u')
    setMessages((cur) => [...cur, { id: userMsgId, role: 'user', content: value }])
    setHistory((cur) => [value, ...cur].slice(0, 10))
    setCommand('')
    if (rawValue !== undefined) setVoiceTranscript(value)

    const thinkingId = mid('sys')
    setMessages((cur) => [...cur, { id: thinkingId, role: 'system', content: 'Thinking…', meta: 'Nexus · processing' }])

    try {
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: value, conversationId }),
      })
      if (!resp.ok) throw new Error(`Request failed (${resp.status})`)

      const serverConv = resp.headers.get('x-conversation-id')
      if (serverConv && serverConv !== conversationId) setConversationId(serverConv)

      // Replace "Thinking…" with a single assistant message that we stream into.
      let assistantText = ''
      let sawApproval = false
      let liveTool = ''
      setMessages((cur) => {
        const withoutThinking = cur.filter((m) => m.id !== thinkingId)
        return [...withoutThinking, { id: thinkingId, role: 'nexus', content: '', meta: `Nexus · ${nowFmt()}` }]
      })

      const reader = resp.body?.getReader()
      if (!reader) throw new Error('Streaming not supported.')
      const decoder = new TextDecoder()
      let buffer = ''

      const handleEvent = (ev: EngineEvent) => {
        if (ev.type === 'text') {
          assistantText += ev.content
          setMessages((cur) =>
            cur.map((m) => (m.id === thinkingId ? { ...m, content: assistantText } : m)),
          )
        } else if (ev.type === 'tool_call') {
          liveTool = ev.toolName
          setMessages((cur) =>
            cur.map((m) =>
              m.id === thinkingId ? { ...m, content: assistantText || `Running ${ev.toolName}…` } : m,
            ),
          )
        } else if (ev.type === 'approval_requested') {
          sawApproval = true
          const appr: PendingApproval = {
            id: ev.approvalId,
            toolName: ev.toolName,
            summary: ev.summary as PendingApproval['summary'],
          }
          setPendingApprovals((prev) => {
            const next = prev.filter((p) => p.id !== appr.id)
            return [appr, ...next]
          })
        } else if (ev.type === 'assistant' && ev.content) {
          assistantText = ev.content
          setMessages((cur) =>
            cur.map((m) => (m.id === thinkingId ? { ...m, content: ev.content } : m)),
          )
        }
      }

      // Read SSE frames.
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const frames = buffer.split('\n\n')
        buffer = frames.pop() ?? ''
        for (const frame of frames) {
          const line = frame.split('\n')[0]
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6).trim()
          if (!payload) continue
          try {
            handleEvent(JSON.parse(payload) as EngineEvent)
          } catch {
            /* skip malformed frame */
          }
        }
      }

      // Finalize the assistant row: replace empty content with a sensible fallback.
      setMessages((cur) =>
        cur.map((m) =>
          m.id === thinkingId
            ? { ...m, content: assistantText || (sawApproval ? 'Awaiting your approval.' : 'No response generated.') }
            : m,
        ),
      )
      if (!assistantText && !sawApproval && !liveTool) {
        throw new Error('No response received.')
      }
      if (rawValue !== undefined && assistantText) speak(assistantText)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'network error'
      setMessages((cur) => {
        const withoutThinking = cur.filter((m) => m.id !== thinkingId)
        return [
          ...withoutThinking,
          { id: mid('sys'), role: 'system', content: `Request failed: ${message}`, meta: 'Error' },
        ]
      })
    } finally {
      setIsBusy(false)
      void refreshConversations()
      void refreshGlobalPanels()
    }
  }

  async function resolveApproval(approvalId: string, status: 'APPROVED' | 'REJECTED') {
    setIsBusy(true)
    const thinkingId = mid('sys')
    setMessages((cur) => [
      ...cur,
      { id: thinkingId, role: 'system', content: status === 'APPROVED' ? 'Executing approved action…' : 'Cancelling…', meta: 'Approval flow' },
    ])
    try {
      const resp = await fetch('/api/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, approvalId, status }),
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const json = (await resp.json()) as { ok: boolean; status: 'APPROVED' | 'REJECTED'; reply: string; state?: ApiState }
      setPendingApprovals((prev) => prev.filter((p) => p.id !== approvalId))
      setMessages((cur) => {
        const withoutThinking = cur.filter((m) => m.id !== thinkingId)
        const additions: Message[] = []
        if (json.status === 'REJECTED') {
          additions.push({ id: mid('sys'), role: 'system', content: 'Action cancelled by user.', meta: 'Approval rejected' })
        } else {
          additions.push({
            id: mid('sys'),
            role: 'system',
            content: 'Approved action completed.',
            meta: 'Tool execution',
          })
        }
        if (json.reply) additions.push({ id: mid('n'), role: 'nexus', content: json.reply, meta: `Nexus · ${nowFmt()}` })
        return [...withoutThinking, ...additions]
      })
      mergeServerState(json.state)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'network error'
      setMessages((cur) => {
        const withoutThinking = cur.filter((m) => m.id !== thinkingId)
        return [
          ...withoutThinking,
          { id: mid('sys'), role: 'system', content: `Approval flow failed: ${message}`, meta: 'Error' },
        ]
      })
    } finally {
      setIsBusy(false)
    }
  }

  async function toggleTask(t: Task) {
    const next = t.status === 'completed' ? 'queued' : 'completed'
    setIsBusy(true)
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: t.id, status: next }),
      })
      if (!res.ok) return
      const json = (await res.json()) as { ok: boolean; task: Task }
      if (json.ok) {
        const updated = { ...t, status: json.task.status as Task['status'] }
        setTasks((cur) => cur.map((x) => (x.id === t.id ? updated : x)))
        setGlobalTasks((cur) => cur.map((x) => (x.id === t.id ? updated : x)))
      }
    } finally {
      setIsBusy(false)
    }
  }

  const nowLabel = useMemo(
    () => new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(new Date()),
    [],
  )

  const activeApproval = pendingApprovals[0]

  const integrationState = (name: string): Integration['state'] => {
    const found = integrations.find((i) => i.name === name)
    return found?.state ?? 'not_connected'
  }

  const suggestions = useMemo(() => {
    const webSearchConnected = integrationState('Web search') === 'connected'
    const gmailConnected = integrationState('Gmail') === 'connected'
    const calendarConnected = integrationState('Calendar') === 'connected'
    const phoneConnected = integrationState('Phone calls') === 'connected'
    const whatsappConnected = integrationState('WhatsApp') === 'connected'
    return [
      { key: 'calendar', label: 'Schedule an event', icon: CalendarDays, prompt: 'Schedule an event for ', enabled: calendarConnected, reason: calendarConnected ? '' : 'Connect Calendar' },
      { key: 'email', label: 'Send an email', icon: Mail, prompt: 'Write an email to ', enabled: gmailConnected, reason: gmailConnected ? '' : 'Connect Gmail' },
      { key: 'searchEmails', label: 'Search emails', icon: Mail, prompt: 'Search my emails for ', enabled: gmailConnected, reason: gmailConnected ? '' : 'Connect Gmail' },
      { key: 'whatsapp', label: 'Send a WhatsApp message', icon: MessageCircle, prompt: 'Send a WhatsApp message to ', enabled: whatsappConnected, reason: whatsappConnected ? '' : 'Configure WhatsApp' },
      { key: 'task', label: 'Add a task', icon: Check, prompt: 'Add a task: ', enabled: true },
      { key: 'search', label: 'Search the web', icon: Globe2, prompt: 'Search the web for ', enabled: webSearchConnected, reason: webSearchConnected ? '' : 'Enable web search' },
      { key: 'phone', label: 'Make a call', icon: Bell, prompt: 'Make a call to ', enabled: phoneConnected, reason: phoneConnected ? 'Tool not available yet' : 'Connect a phone provider' },
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [integrations])

  function pickSuggestion(s: (typeof suggestions)[number]) {
    if (!s.enabled) return
    setCommand(s.prompt)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  function runSuggestion(s: (typeof suggestions)[number]) {
    if (!s.enabled) return
    void submitCommand(s.prompt)
  }

  const isEmpty = messages.length <= 1

  const inputForm = (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-3 flex items-center gap-2">
        <button
          onClick={isSpeaking ? stopSpeaking : toggleVoice}
          disabled={!voiceSupported || isBusy}
          className={`inline-flex flex-1 items-center justify-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium transition ${
            isListening
              ? 'animate-pulse border-destructive/40 bg-destructive/10 text-destructive'
              : isSpeaking
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-border bg-muted/40 text-foreground hover:bg-muted'
          } disabled:cursor-not-allowed disabled:opacity-40`}
          aria-label={
            !voiceSupported
              ? 'Voice conversation unsupported'
              : isSpeaking
                ? 'Stop speaking'
                : isListening
                  ? 'Stop voice conversation'
                  : 'Start a voice conversation'
          }
        >
          {isListening ? (
            <X className="size-4" />
          ) : isSpeaking ? (
            <Volume2 className="size-4" />
          ) : (
            <Mic className="size-4" />
          )}
          <span>
            {!voiceSupported
              ? 'Voice unavailable (try Chrome/Edge)'
              : isSpeaking
                ? 'Nexus is speaking… tap to stop'
                : isListening
                  ? 'Listening… tap to stop'
                  : 'Start a voice conversation'}
          </span>
        </button>
      </div>
      <div className="relative rounded-lg border border-input bg-background shadow-sm focus-within:ring-2 focus-within:ring-ring">
        <textarea
          ref={inputRef}
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing &&
              (event as any).keyCode !== 229
            ) {
              event.preventDefault()
              void submitCommand()
            }
          }}
          placeholder="Type a command for Nexus… (try: help / time in Tokyo / add task: design review / search Next.js 16)"
          className="min-h-14 w-full resize-none bg-transparent px-4 pb-12 pt-3 text-sm outline-none placeholder:text-muted-foreground"
          aria-label="Command input"
          disabled={isBusy}
        />
        <div className="absolute bottom-2 left-3 flex items-center gap-1 text-[11px] text-muted-foreground">
          <kbd className="rounded border border-border px-1.5 py-0.5 font-mono">↵</kbd> send{' '}
          <span className="mx-1">·</span>
          <kbd className="rounded border border-border px-1.5 py-0.5 font-mono">⇧ ↵</kbd> new line
        </div>
        <div className="absolute bottom-2 right-2 flex items-center gap-1">
          <button
            onClick={isSpeaking ? stopSpeaking : toggleVoice}
            disabled={!voiceSupported || isBusy}
            className={`rounded-md p-2 ${
              isListening
                ? 'bg-destructive/10 text-destructive'
                : isSpeaking
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted'
            } disabled:cursor-not-allowed disabled:opacity-40`}
            aria-label={
              !voiceSupported
                ? 'Voice input unsupported'
                : isSpeaking
                  ? 'Stop speaking'
                  : isListening
                    ? 'Stop voice conversation'
                    : 'Start voice conversation'
            }
          >
            {isListening ? (
              <X className="size-4" />
            ) : isSpeaking ? (
              <Volume2 className="size-4" />
            ) : (
              <Mic className="size-4" />
            )}
          </button>
          <button
            onClick={() => void submitCommand()}
            disabled={!command.trim() || isBusy}
            className="rounded-md bg-primary p-2 text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Send command"
          >
            <ArrowUp className="size-4" />
          </button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        {suggestions.map((s) => (
          <button
            key={s.key}
            onClick={() => pickSuggestion(s)}
            disabled={!s.enabled}
            title={s.enabled ? `Start: ${s.prompt}` : s.reason}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition ${
              s.enabled
                ? 'border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
                : 'cursor-not-allowed border-dashed border-border text-muted-foreground/40'
            }`}
          >
            <s.icon className="size-3.5" />
            <span>{s.label}</span>
            {!s.enabled && <span className="opacity-60">· {s.reason}</span>}
          </button>
        ))}
      </div>
      {(isListening || isSpeaking || voiceTranscript || !voiceSupported) && (
        <div className="mt-3 rounded-md border border-border bg-muted/40 p-3 text-xs">
          <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            <span>
              {!voiceSupported
                ? 'Voice unavailable'
                : isListening
                  ? 'Listening'
                  : isSpeaking
                    ? 'Nexus speaking'
                    : voiceTranscript
                      ? 'Voice transcript'
                      : 'Voice ready'}
            </span>
            {(isListening || isSpeaking) && (
              <span className="size-2 animate-pulse rounded-full bg-primary" />
            )}
          </div>
          {!voiceSupported ? (
            <p className="mt-2 text-muted-foreground">
              Your browser does not support speech recognition. Try Chrome or Edge.
            </p>
          ) : (
            <p className="mt-2 leading-relaxed">
              {voiceTranscript ||
                (isSpeaking
                  ? messages.filter((m) => m.role === 'nexus').slice(-1)[0]?.content?.slice(0, 240) ?? ''
                  : 'Speak a command to Nexus.')}
            </p>
          )}
          {isListening && (
            <button
              onClick={toggleVoice}
              className="mt-3 inline-flex items-center gap-2 text-xs font-medium text-destructive hover:underline"
            >
              <X className="size-3.5" /> Stop listening
            </button>
          )}
        </div>
      )}
    </div>
  )

  return (
    <main className="min-h-screen bg-background text-foreground selection:bg-primary selection:text-primary-foreground">
      <header className="flex h-16 items-center justify-between border-b border-border bg-card/80 px-4 backdrop-blur md:px-8">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <TerminalSquare className="size-4" />
          </div>
          <div>
            <div className="font-mono text-sm font-semibold tracking-[0.2em]">NEXUS</div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              AI terminal / v0.2 · live
            </div>
          </div>
        </div>
        <div className="hidden items-center gap-2 rounded-full border border-border bg-muted/60 px-3 py-1.5 font-mono text-[11px] text-muted-foreground md:flex">
          <span className={`size-1.5 rounded-full ${isBusy ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
          {isBusy ? 'PROCESSING' : 'SYSTEM OPERATIONAL'}
        </div>
        <div className="flex items-center gap-3">
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.image} alt="" className="size-6 rounded-full bg-accent" />
          ) : (
            <div className="flex size-6 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <UserRound className="size-3.5" />
            </div>
          )}
          <span className="hidden md:block">{user.name || user.email || 'User'}</span>
          <SignOutButton />
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] lg:grid-cols-[220px_minmax(0,1fr)_280px]">
        <aside className="hidden border-r border-border p-5 lg:block">
          <button
            onClick={newConversation}
            className="mb-7 flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90"
          >
            <Plus className="size-4" /> New conversation
          </button>
          <div className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Workspace
          </div>
          <nav className="space-y-1 text-sm">
            <a className="flex items-center gap-3 rounded-md bg-accent px-3 py-2.5 font-medium text-accent-foreground" href="#terminal">
              <Command className="size-4" /> Terminal
            </a>
            <button
              onClick={() => setPanelModal('activity')}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-muted-foreground hover:bg-muted"
            >
              <Activity className="size-4" /> Activity
            </button>
            <button
              onClick={() => setPanelModal('tasks')}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-muted-foreground hover:bg-muted"
            >
              <Check className="size-4" /> Tasks
            </button>
          </nav>
          <div className="mb-3 mt-9 flex items-center justify-between font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <span>Conversations</span>
            <button
              onClick={() => void refreshConversations()}
              className="text-[10px] normal-case tracking-normal text-primary hover:underline"
            >
              refresh
            </button>
          </div>
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={conversationSearch}
              onChange={(e) => setConversationSearch(e.target.value)}
              placeholder="Search conversations…"
              className="w-full rounded-md border border-border bg-muted/40 py-1.5 pl-8 pr-2 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
            />
          </div>
          <div className="max-h-[50vh] space-y-1 overflow-y-auto text-xs text-muted-foreground">
            {!conversationsLoaded ? (
              <div className="px-3 py-2 italic opacity-70">Loading…</div>
            ) : conversations.length === 0 ? (
              <div className="px-3 py-2 italic opacity-70">No saved conversations yet.</div>
            ) : (
              conversations
                .filter((c) => {
                  const q = conversationSearch.trim().toLowerCase()
                  if (!q) return true
                  const title = c.title && c.title !== 'New conversation' ? c.title : 'New conversation'
                  const haystack = `${title} ${c.preview ?? ''}`.toLowerCase()
                  return haystack.includes(q)
                })
                .map((c) => {
                  const active = c.id === conversationId
                  const title = c.title && c.title !== 'New conversation' ? c.title : 'New conversation'
                  return (
                    <button
                      key={c.id}
                      onClick={() => void loadConversation(c.id)}
                      className={`w-full truncate rounded px-3 py-2 text-left hover:bg-muted ${
                        active ? 'bg-accent font-medium text-accent-foreground' : ''
                      }`}
                      title={title}
                    >
                      {title}
                    </button>
                  )
                })
            )}
          </div>
          <div className="mt-auto pt-40">
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              <ShieldCheck className="size-4 shrink-0 text-emerald-600" />
              <span>Actions are always permissioned.</span>
            </div>
          </div>
        </aside>

        <section
          id="terminal"
          className="flex min-w-0 flex-col border-border lg:border-r"
          style={{ height: 'calc(100dvh - 4rem)' }}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4 md:px-8">
            <div>
              <h1 className="font-mono text-sm font-semibold tracking-wide">/ terminal</h1>
              <p className="mt-1 text-xs text-muted-foreground">
                Ask Nexus to search, plan, and act on your behalf.
              </p>
            </div>
            <button className="rounded-md p-2 text-muted-foreground hover:bg-muted" aria-label="More options">
              <MoreHorizontal className="size-4" />
            </button>
          </div>

          {isEmpty ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-7 overflow-y-auto p-6">
              {messages.map((message) => (
                <div key={message.id} className="flex w-full max-w-2xl flex-col items-center text-center">
                  <div className="mb-1 inline-flex items-center gap-2 font-mono text-base font-semibold uppercase tracking-[0.22em] text-primary">
                    <Sparkles className="size-4" /> Nexus AI and Automation
                  </div>
                  <p className="mb-6 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                    {message.content}
                  </p>
                  <div className="grid w-full grid-cols-1 gap-2 text-left sm:grid-cols-2">
                    {suggestions.map((s) => (
                      <button
                        key={s.key}
                        onClick={() => runSuggestion(s)}
                        disabled={!s.enabled}
                        title={s.enabled ? `Start: ${s.prompt}` : s.reason}
                        className={`flex items-start gap-3 rounded-lg border px-4 py-3 transition ${
                          s.enabled
                            ? 'border-border bg-card hover:bg-muted'
                            : 'cursor-not-allowed border-dashed border-border bg-transparent'
                        }`}
                      >
                        <span
                          className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md ${
                            s.enabled ? 'bg-muted text-muted-foreground' : 'bg-muted/40 text-muted-foreground/40'
                          }`}
                        >
                          <s.icon className="size-4" />
                        </span>
                        <span className="min-w-0">
                          <span className={`block text-sm font-medium ${s.enabled ? 'text-foreground' : 'text-muted-foreground/40'}`}>
                            {s.label}
                          </span>
                          {!s.enabled && (
                            <span className="block text-[11px] text-muted-foreground/50">{s.reason}</span>
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {inputForm}
            </div>
          ) : (
            <>
              <div
                ref={messagesRef}
                className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5 md:p-8"
              >
                {messages.map((message) => (
                  <MessageRow key={message.id} message={message} />
                ))}
                {isBusy && (
                  <div className="flex gap-3">
                    <LoaderCircle className="size-4 animate-spin text-muted-foreground mt-1.5" />
                    <div className="font-mono text-xs text-muted-foreground">Working…</div>
                  </div>
                )}
                {activeApproval && (
                  <ApprovalCard
                    key={activeApproval.id}
                    toolName={activeApproval.toolName}
                    title={activeApproval.summary?.title}
                    message={activeApproval.summary?.message}
                    subject={activeApproval.summary?.subject}
                    to={activeApproval.summary?.to}
                    onApprove={() => void resolveApproval(activeApproval.id, 'APPROVED')}
                    onCancel={() => void resolveApproval(activeApproval.id, 'REJECTED')}
                    busy={isBusy}
                  />
                )}
              </div>
              <div className="shrink-0 border-t border-border bg-card/95 p-4 md:p-6">
                {inputForm}
              </div>
            </>
          )}
        </section>

        <aside className="hidden space-y-7 p-5 xl:block">
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Connections
              </h2>
              <button className="text-xs text-primary hover:underline">Manage</button>
            </div>
            <div className="space-y-2">
              {integrations.length === 0 ? (
                <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
                  Loading connections…
                </div>
              ) : (
                integrations.map(({ name, detail, state }) => (
                  <div
                    key={name}
                    className="flex items-center gap-3 rounded-md border border-border bg-card p-3"
                  >
                    <div className="flex size-8 items-center justify-center rounded-md bg-muted">
                      <IntegrationIcon name={name} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{name}</div>
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span
                          className={`size-1.5 rounded-full ${
                            state === 'connected' ? 'bg-emerald-500' : 'bg-muted-foreground/50'
                          }`}
                        />
                        {detail}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div id="activity">
            <div className="mb-3 flex items-center gap-4 border-b border-border">
              <button
                onClick={() => setActiveTab('activity')}
                className={`pb-2 font-mono text-[10px] uppercase tracking-[0.14em] ${
                  activeTab === 'activity'
                    ? 'border-b-2 border-primary text-foreground'
                    : 'text-muted-foreground'
                }`}
              >
                Activity
              </button>
              <button
                onClick={() => setActiveTab('tasks')}
                className={`pb-2 font-mono text-[10px] uppercase tracking-[0.14em] ${
                  activeTab === 'tasks'
                    ? 'border-b-2 border-primary text-foreground'
                    : 'text-muted-foreground'
                }`}
              >
                Tasks
              </button>
            </div>
            {activeTab === 'activity' ? (
              <div className="space-y-4 max-h-[380px] overflow-y-auto pr-1">
                {activity.length === 0 ? (
                  <div className="text-xs text-muted-foreground">No activity yet.</div>
                ) : (
                  activity.map((a) => (
                    <div className="flex gap-3" key={a.id}>
                      <div className="pt-0.5 font-mono text-[10px] text-muted-foreground w-12 shrink-0">
                        {a.time}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-medium truncate">{a.title}</div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground break-words">
                          {a.detail}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1" id="tasks">
                {tasks.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border p-4 text-xs text-muted-foreground">
                    No active tasks. Say <code className="rounded bg-muted px-1">add task: …</code> to create one.
                  </div>
                ) : (
                  tasks.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-start gap-3 rounded-md border border-border bg-card p-3"
                    >
                      <button
                        onClick={() => void toggleTask(t)}
                        className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border ${
                          t.status === 'completed'
                            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600'
                            : 'border-border text-muted-foreground hover:bg-muted'
                        }`}
                        aria-label="Toggle task done"
                      >
                        {t.status === 'completed' ? <Check className="size-3" /> : null}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div
                          className={`text-sm ${
                            t.status === 'completed' ? 'line-through text-muted-foreground' : ''
                          }`}
                        >
                          {t.title}
                        </div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground capitalize">
                          {t.status.replace('_', ' ')}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="rounded-lg bg-primary p-4 text-primary-foreground">
            <div className="flex items-center gap-2 text-xs font-medium">
              <LockKeyhole className="size-3.5" /> Privacy by default
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-primary-foreground/70">
              Credentials stay server-side. Nexus only sees the tools and results it needs. Set
              <code className="mx-1 rounded bg-black/10 px-1">OPENAI_API_KEY</code> in your
              environment to enable live LLM responses.
            </p>
          </div>
        </aside>
      </div>

      {panelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setPanelModal(null)}>
          <div
            className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-xl border border-border bg-background shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
              <h2 className="flex items-center gap-2 font-mono text-sm font-semibold tracking-wide">
                {panelModal === 'activity' ? <Activity className="size-4" /> : <Check className="size-4" />}
                {panelModal === 'activity' ? 'All Activity' : 'All Tasks'}
              </h2>
              <button
                onClick={() => setPanelModal(null)}
                className="rounded-md p-2 text-muted-foreground hover:bg-muted"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {panelModal === 'activity' ? (
                globalActivity.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No activity across conversations yet.</div>
                ) : (
                  <div className="space-y-1">
                    {globalActivity.map((a) => {
                      const expanded = expandedActivities.has(a.id)
                      return (
                        <div key={a.id} className="rounded-lg border border-border">
                          <button
                            onClick={() =>
                              setExpandedActivities((cur) => {
                                const next = new Set(cur)
                                if (next.has(a.id)) next.delete(a.id)
                                else next.add(a.id)
                                return next
                              })
                            }
                            className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted"
                          >
                            <ChevronDown
                              className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${
                                expanded ? 'rotate-180' : ''
                              }`}
                            />
                            <span className="w-12 shrink-0 font-mono text-[10px] text-muted-foreground">{a.time}</span>
                            <span className="min-w-0 flex-1 truncate text-sm font-medium capitalize">{a.title}</span>
                          </button>
                          {expanded && (
                            <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                              <div className="mb-1 capitalize">
                                <span className="font-medium text-foreground">Type:</span> {a.kind}
                              </div>
                              {a.detail ? (
                                <div className="break-words">
                                  <span className="font-medium text-foreground">Details:</span> {a.detail}
                                </div>
                              ) : (
                                <div>No additional details.</div>
                              )}
                              {a.conversationId && (
                                <button
                                  onClick={() => {
                                    setPanelModal(null)
                                    void loadConversation(a.conversationId as string)
                                  }}
                                  className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-primary hover:bg-muted"
                                >
                                  <MessageCircle className="size-3" /> Open conversation
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              ) : globalTasks.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No tasks across conversations yet. Say{' '}
                  <code className="rounded bg-muted px-1">add task: …</code> to create one.
                </div>
              ) : (
                <div className="space-y-1">
                  {globalTasks.map((t) => (
                    <div
                      key={t.id}
                      className={`flex items-center gap-3 rounded-lg border border-border px-3 py-2 ${
                        t.status === 'completed' ? 'bg-muted/40' : ''
                      }`}
                    >
                      <button
                        onClick={() => void toggleTask(t)}
                        disabled={isBusy}
                        className={`flex size-5 shrink-0 items-center justify-center rounded-md border transition ${
                          t.status === 'completed'
                            ? 'border-emerald-500 bg-emerald-500 text-white'
                            : 'border-border text-transparent hover:border-primary'
                        }`}
                        aria-label={t.status === 'completed' ? 'Mark undone' : 'Mark done'}
                        title={t.status === 'completed' ? 'Mark undone' : 'Mark done'}
                      >
                        <Check className="size-3" />
                      </button>
                      <div className="min-w-0 flex-1">
                        <div
                          className={`text-sm ${
                            t.status === 'completed' ? 'line-through text-muted-foreground' : ''
                          }`}
                        >
                          {t.title}
                        </div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground capitalize">
                          {t.status.replace('_', ' ')}
                          {t.dueAt ? ` · due ${new Date(t.dueAt).toLocaleDateString()}` : ''}
                        </div>
                      </div>
                      {t.conversationId && (
                        <button
                          onClick={() => {
                            setPanelModal(null)
                            void loadConversation(t.conversationId as string)
                          }}
                          className="shrink-0 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-primary hover:bg-muted"
                        >
                          Open conversation
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function MessageRow({ message }: { message: Message }) {
  return (
    <div className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : ''}`}>
      <div
        className={`max-w-2xl ${
          message.role === 'user'
            ? 'order-first rounded-lg bg-primary px-4 py-3 text-sm text-primary-foreground whitespace-pre-wrap break-words'
            : ''
        }`}
      >
        {message.role !== 'user' && (
          <div className="mb-2 flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            {message.role === 'system' ? (
              <>
                <LoaderCircle className="size-3 animate-spin" /> Tool execution / System
              </>
            ) : (
              <>
                <Sparkles className="size-3 text-primary" /> Nexus AI
              </>
            )}
          </div>
        )}
        <p
          className={
            message.role === 'system'
              ? 'font-mono text-xs text-muted-foreground whitespace-pre-wrap break-words'
              : 'text-sm leading-relaxed whitespace-pre-wrap break-words'
          }
        >
          {message.content}
        </p>
        {message.meta && <div className="mt-2 text-[11px] text-muted-foreground">{message.meta}</div>}
      </div>
    </div>
  )
}

function ApprovalCard({
  toolName,
  title,
  message,
  subject,
  to,
  onApprove,
  onCancel,
  busy,
}: {
  toolName: string
  title?: string
  message?: string
  subject?: string
  to?: string
  onApprove: () => void
  onCancel: () => void
  busy?: boolean
}) {
  return (
    <div className="max-w-2xl rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
      <div className="flex items-start gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-amber-500/15 text-amber-700">
          <LockKeyhole className="size-4" />
        </div>
        <div className="flex-1">
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-amber-700">
            Action requires approval · {toolName.replace(/([A-Z])/g, ' $1').trim()}
          </div>
          <div className="mt-3 grid gap-2 text-xs">
            {to ? (
              <div>
                <span className="text-muted-foreground">To:</span> {to}
              </div>
            ) : null}
            {subject ? (
              <div>
                <span className="text-muted-foreground">Subject:</span> {subject}
              </div>
            ) : null}
            {title ? (
              <div>
                <span className="text-muted-foreground">Title:</span> {title}
              </div>
            ) : null}
            {message ? (
              <div>
                <span className="text-muted-foreground">Message:</span> {message}
              </div>
            ) : null}
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={onApprove}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              <Check className="size-3.5" /> Approve & run
            </button>
            <button
              onClick={onCancel}
              disabled={busy}
              className="rounded-md border border-border bg-background px-3 py-2 text-xs hover:bg-muted disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function IntegrationIcon({ name }: { name: string }) {
  const Icon =
    name === 'Gmail' || name === 'Calendar'
      ? name === 'Calendar'
        ? CalendarDays
        : Mail
      : name === 'Web search'
        ? Globe2
        : name === 'Phone calls'
          ? Bell
          : name === 'WhatsApp'
            ? MessageCircle
            : name === 'Voice'
              ? Mic
              : Sparkles
  return <Icon className="size-4 text-muted-foreground" />
}
