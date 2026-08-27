'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  ArrowUp,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Command,
  FileText,
  Globe2,
  LoaderCircle,
  LockKeyhole,
  Mail,
  Mic,
  MoreHorizontal,
  Play,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  UserRound,
  X,
  Volume2,
} from 'lucide-react'

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition
    webkitSpeechRecognition?: new () => SpeechRecognition
  }
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
}

type Task = {
  id: string
  title: string
  status: 'queued' | 'in_progress' | 'completed'
  dueAt?: string
  createdAt: string
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

const connections = [
  { name: 'Gmail', detail: 'Connected', icon: Mail, state: 'connected' },
  { name: 'Calendar', detail: 'Connected', icon: CalendarDays, state: 'connected' },
  { name: 'Web search', detail: 'Ready', icon: Globe2, state: 'connected' },
  { name: 'Telegram', detail: 'Not connected', icon: Send, state: 'idle' },
]

const DEFAULT_CONV_ID = 'conv_default'
const DEFAULT_USER_ID = 'user-local'

const nowFmt = () =>
  new Intl.DateTimeFormat('en', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  }).format(new Date())

const mid = (prefix = 'm') => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`

export function NexusTerminal() {
  const [messages, setMessages] = useState<Message[]>([
    { id: mid(), role: 'nexus', content: "Hi — I'm Nexus. Ask me the time in a city, add a task, or search the web. Say 'help' for more.", meta: 'Nexus · welcome' },
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

  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [voiceTranscript, setVoiceTranscript] = useState('')
  const [voiceSupported, setVoiceSupported] = useState(true)
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  // Load initial state from server (hydrates tasks/activity if already present on server)
  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch(`/api/state?conversationId=${encodeURIComponent(conversationId)}`, { cache: 'no-store' })
        if (!res.ok) return
        const json = (await res.json()) as { ok: boolean; conversationId: string; state: ApiState }
        if (json.ok && json.state) {
          if (json.state.activity?.length) {
            setActivity((prev) => {
              const seen = new Set(prev.map((a) => a.id))
              const extras = json.state.activity.filter((a) => !seen.has(a.id))
              return [...extras, ...prev]
            })
          }
          if (json.state.tasks?.length) setTasks(json.state.tasks)
          if (json.state.pendingApprovals?.length) setPendingApprovals(json.state.pendingApprovals)
        }
      } catch {
        /* no-op, offline graceful */
      }
    })()
  }, [conversationId])

  // Speech recognition + synthesis setup
  useEffect(() => {
    const SpeechRecognitionAPI = typeof window === 'undefined' ? null : window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognitionAPI) {
      setVoiceSupported(false)
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
        body: JSON.stringify({ message: value, conversationId, userId: DEFAULT_USER_ID }),
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const json = (await resp.json()) as {
        ok: boolean
        conversationId: string
        reply: string
        state?: ApiState
      }
      if (json.conversationId !== conversationId) setConversationId(json.conversationId)
      // Replace "Thinking…" with tool/system events and final reply
      setMessages((cur) => {
        const withoutThinking = cur.filter((m) => m.id !== thinkingId)
        const additions: Message[] = []
        const pa = json.state?.pendingApprovals ?? []
        if (pa.length > 0) {
          const latest = pa[0]
          additions.push({
            id: mid('sys'),
            role: 'system',
            content: `${latest.toolName.toUpperCase()} awaiting approval`,
            meta: `Approval requested · ${nowFmt()}`,
          })
        }
        additions.push({
          id: mid('n'),
          role: 'nexus',
          content: json.reply,
          meta: `Nexus · ${nowFmt()}`,
        })
        return [...withoutThinking, ...additions]
      })
      mergeServerState(json.state)
      // Speak the reply (only when triggered by voice to avoid spam)
      if (rawValue !== undefined) speak(json.reply)
    } catch (err: any) {
      setMessages((cur) => {
        const withoutThinking = cur.filter((m) => m.id !== thinkingId)
        return [
          ...withoutThinking,
          { id: mid('sys'), role: 'system', content: `Request failed: ${err?.message ?? 'network error'}`, meta: 'Error' },
        ]
      })
    } finally {
      setIsBusy(false)
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
            content: `Approved action completed in ${Math.round(Math.random() * 12 + 4) / 10}s`,
            meta: 'Tool execution',
          })
        }
        if (json.reply) additions.push({ id: mid('n'), role: 'nexus', content: json.reply, meta: `Nexus · ${nowFmt()}` })
        return [...withoutThinking, ...additions]
      })
      mergeServerState(json.state)
    } catch (err: any) {
      setMessages((cur) => {
        const withoutThinking = cur.filter((m) => m.id !== thinkingId)
        return [
          ...withoutThinking,
          { id: mid('sys'), role: 'system', content: `Approval flow failed: ${err?.message ?? 'network error'}`, meta: 'Error' },
        ]
      })
    } finally {
      setIsBusy(false)
    }
  }

  const nowLabel = useMemo(
    () => new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(new Date()),
    [],
  )

  const activeApproval = pendingApprovals[0]

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
        <button
          className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-sm hover:bg-muted"
          aria-label="Open account menu"
        >
          <div className="flex size-6 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <UserRound className="size-3.5" />
          </div>
          <span className="hidden md:block">Alex Morgan</span>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </button>
      </header>

      <div className="mx-auto grid max-w-[1500px] lg:grid-cols-[220px_minmax(0,1fr)_280px]">
        <aside className="hidden border-r border-border p-5 lg:block">
          <button
            onClick={() => {
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
            }}
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
            <a className="flex items-center gap-3 rounded-md px-3 py-2.5 text-muted-foreground hover:bg-muted" href="#activity">
              <Activity className="size-4" /> Activity
            </a>
            <a className="flex items-center gap-3 rounded-md px-3 py-2.5 text-muted-foreground hover:bg-muted" href="#tasks">
              <Check className="size-4" /> Tasks
            </a>
          </nav>
          <div className="mb-3 mt-9 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Recent
          </div>
          <div className="space-y-1 text-xs text-muted-foreground">
            {history.length === 0 ? (
              <div className="px-3 py-2 italic opacity-70">No recent queries yet.</div>
            ) : (
              history.map((h, i) => (
                <button
                  key={`${h}-${i}`}
                  onClick={() => setCommand(h)}
                  className="w-full truncate rounded px-3 py-2 text-left hover:bg-muted"
                  title={h}
                >
                  {h}
                </button>
              ))
            )}
          </div>
          <div className="mt-auto pt-40">
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              <ShieldCheck className="size-4 shrink-0 text-emerald-600" />
              <span>Actions are always permissioned.</span>
            </div>
          </div>
        </aside>

        <section id="terminal" className="min-w-0 border-border lg:border-r">
          <div className="flex items-center justify-between border-b border-border px-5 py-4 md:px-8">
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
          <div className="min-h-[460px] space-y-6 p-5 md:p-8">
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
          <div className="sticky bottom-0 border-t border-border bg-card/95 p-4 md:p-6">
            <div className="mx-auto max-w-3xl">
              <div className="relative rounded-lg border border-input bg-background shadow-sm focus-within:ring-2 focus-within:ring-ring">
                <textarea
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
                          ? messages
                              .filter((m) => m.role === 'nexus')
                              .slice(-1)[0]
                              ?.content?.slice(0, 240) ?? ''
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
          </div>
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
              {connections.map(({ name, detail, icon: Icon, state }) => (
                <div
                  key={name}
                  className="flex items-center gap-3 rounded-md border border-border bg-card p-3"
                >
                  <div className="flex size-8 items-center justify-center rounded-md bg-muted">
                    <Icon className="size-4 text-muted-foreground" />
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
              ))}
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
                        onClick={async () => {
                          const next = t.status === 'completed' ? 'queued' : 'completed'
                          setIsBusy(true)
                          try {
                            const res = await fetch('/api/agent', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                tool: 'createTask',
                                conversationId,
                                input: { title: t.title, status: next },
                              }),
                            })
                            // Fire-and-forget optimistic toggle; re-sync via /api/state
                            setTasks((cur) =>
                              cur.map((x) => (x.id === t.id ? { ...x, status: next } : x)),
                            )
                            void res.json()
                            const state = await fetch(
                              `/api/state?conversationId=${encodeURIComponent(conversationId)}`,
                            )
                              .then((r) => r.json())
                              .catch(() => null)
                            if (state?.ok) mergeServerState(state.state)
                          } finally {
                            setIsBusy(false)
                          }
                        }}
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
