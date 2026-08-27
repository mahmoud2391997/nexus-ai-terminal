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
  Zap,
  Volume2,
} from 'lucide-react'

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition
    webkitSpeechRecognition?: new () => SpeechRecognition
  }
}

type Message = {
  id: string
  role: 'user' | 'nexus' | 'system'
  content: string
  meta?: string
}

const initialMessages: Message[] = [
  { id: 'm1', role: 'user', content: 'Find any urgent emails from Ahmed this week.' },
  { id: 'm2', role: 'system', content: 'SEARCH_EMAILS  completed in 1.8s', meta: 'Gmail connection' },
  { id: 'm3', role: 'nexus', content: 'I found 3 messages from Ahmed. One is marked urgent and asks to move the project meeting to Tuesday at 3:00 PM.', meta: 'Nexus · 10:42 AM' },
]

const connections = [
  { name: 'Gmail', detail: 'Connected', icon: Mail, state: 'connected' },
  { name: 'Calendar', detail: 'Connected', icon: CalendarDays, state: 'connected' },
  { name: 'Web search', detail: 'Ready', icon: Globe2, state: 'connected' },
  { name: 'Telegram', detail: 'Not connected', icon: Send, state: 'idle' },
]

export function NexusTerminal() {
  const [messages, setMessages] = useState(initialMessages)
  const [command, setCommand] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [voiceTranscript, setVoiceTranscript] = useState('')
  const [voiceSupported, setVoiceSupported] = useState(true)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const voiceReply = 'I’m ready. I can search your connected tools, plan the next step, or prepare an action for your approval.'
  const [approval, setApproval] = useState(true)
  const [history, setHistory] = useState<string[]>(['Find any urgent emails from Ahmed this week.'])
  const [activeTab, setActiveTab] = useState<'activity' | 'tasks'>('activity')

  const now = useMemo(() => new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(new Date()), [])

  function submitCommand(value = command) {
    const trimmed = value.trim()
    if (!trimmed) return
    setMessages((current) => [...current, { id: `u-${Date.now()}`, role: 'user', content: trimmed }])
    setHistory((current) => [trimmed, ...current].slice(0, 10))
    setCommand('')
    if (value !== command) setVoiceTranscript(trimmed)
    window.setTimeout(() => {
      setMessages((current) => [...current, { id: `n-${Date.now()}`, role: 'nexus', content: voiceReply, meta: 'Nexus · voice reply' }])
      if ('speechSynthesis' in window) {
        setIsSpeaking(true)
        const utterance = new SpeechSynthesisUtterance(voiceReply)
        utterance.onend = () => setIsSpeaking(false)
        window.speechSynthesis.cancel()
        window.speechSynthesis.speak(utterance)
      }
    }, 450)
  }

  useEffect(() => {
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognitionAPI) { setVoiceSupported(false); return }
    const recognition = new SpeechRecognitionAPI()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map((result) => result[0].transcript).join('')
      setVoiceTranscript(transcript)
      if (event.results[event.results.length - 1].isFinal) submitCommand(transcript)
    }
    recognition.onend = () => setIsListening(false)
    recognition.onerror = () => setIsListening(false)
    recognitionRef.current = recognition
    return () => { recognition.stop(); window.speechSynthesis?.cancel() }
  }, [])

  function toggleVoice() {
    if (!voiceSupported) return
    if (isListening) { recognitionRef.current?.stop(); setIsListening(false); return }
    setVoiceTranscript('')
    window.speechSynthesis?.cancel()
    setIsSpeaking(false)
    recognitionRef.current?.start()
    setIsListening(true)
  }

  return (
    <main className="min-h-screen bg-background text-foreground selection:bg-primary selection:text-primary-foreground">
      <header className="flex h-16 items-center justify-between border-b border-border bg-card/80 px-4 backdrop-blur md:px-8">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm"><TerminalSquare className="size-4" /></div>
          <div><div className="font-mono text-sm font-semibold tracking-[0.2em]">NEXUS</div><div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">AI terminal / v0.1</div></div>
        </div>
        <div className="hidden items-center gap-2 rounded-full border border-border bg-muted/60 px-3 py-1.5 font-mono text-[11px] text-muted-foreground md:flex"><span className="size-1.5 rounded-full bg-emerald-500" /> SYSTEM OPERATIONAL</div>
        <button className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-sm hover:bg-muted" aria-label="Open account menu"><div className="flex size-6 items-center justify-center rounded-full bg-accent text-accent-foreground"><UserRound className="size-3.5" /></div><span className="hidden md:block">Alex Morgan</span><ChevronDown className="size-3.5 text-muted-foreground" /></button>
      </header>

      <div className="mx-auto grid max-w-[1500px] lg:grid-cols-[220px_minmax(0,1fr)_280px]">
        <aside className="hidden border-r border-border p-5 lg:block">
          <button className="mb-7 flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90"><Plus className="size-4" /> New conversation</button>
          <div className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Workspace</div>
          <nav className="space-y-1 text-sm"><a className="flex items-center gap-3 rounded-md bg-accent px-3 py-2.5 font-medium text-accent-foreground" href="#terminal"><Command className="size-4" /> Terminal</a><a className="flex items-center gap-3 rounded-md px-3 py-2.5 text-muted-foreground hover:bg-muted" href="#activity"><Activity className="size-4" /> Activity</a><a className="flex items-center gap-3 rounded-md px-3 py-2.5 text-muted-foreground hover:bg-muted" href="#tasks"><Check className="size-4" /> Tasks</a></nav>
          <div className="mb-3 mt-9 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Recent</div>
          <div className="space-y-1 text-xs text-muted-foreground"><button className="w-full truncate rounded px-3 py-2 text-left hover:bg-muted">Urgent emails · Today</button><button className="w-full truncate rounded px-3 py-2 text-left hover:bg-muted">Plan launch campaign</button><button className="w-full truncate rounded px-3 py-2 text-left hover:bg-muted">Prepare weekly briefing</button></div>
          <div className="mt-auto pt-40"><div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground"><ShieldCheck className="size-4 shrink-0 text-emerald-600" /><span>Actions are always permissioned.</span></div></div>
        </aside>

        <section id="terminal" className="min-w-0 border-border lg:border-r">
          <div className="flex items-center justify-between border-b border-border px-5 py-4 md:px-8"><div><h1 className="font-mono text-sm font-semibold tracking-wide">/ terminal</h1><p className="mt-1 text-xs text-muted-foreground">Ask Nexus to search, plan, and act on your behalf.</p></div><button className="rounded-md p-2 text-muted-foreground hover:bg-muted" aria-label="More options"><MoreHorizontal className="size-4" /></button></div>
          <div className="min-h-[460px] space-y-6 p-5 md:p-8">
            {messages.map((message) => <MessageRow key={message.id} message={message} />)}
            {approval && <ApprovalCard onApprove={() => setApproval(false)} onCancel={() => setApproval(false)} />}
            {!approval && <div className="flex items-center gap-2 font-mono text-xs text-emerald-700"><Check className="size-4" /> EMAIL_DRAFT_APPROVED · ready to send</div>}
          </div>
          <div className="sticky bottom-0 border-t border-border bg-card/95 p-4 md:p-6"><div className="mx-auto max-w-3xl"><div className="relative rounded-lg border border-input bg-background shadow-sm focus-within:ring-2 focus-within:ring-ring"><textarea value={command} onChange={(event) => setCommand(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); submitCommand() } }} placeholder="Type a command for Nexus..." className="min-h-14 w-full resize-none bg-transparent px-4 pb-12 pt-3 text-sm outline-none placeholder:text-muted-foreground" aria-label="Command input" /><div className="absolute bottom-2 left-3 flex items-center gap-1 text-[11px] text-muted-foreground"><kbd className="rounded border border-border px-1.5 py-0.5 font-mono">↵</kbd> send <span className="mx-1">·</span><kbd className="rounded border border-border px-1.5 py-0.5 font-mono">⇧ ↵</kbd> new line</div><div className="absolute bottom-2 right-2 flex items-center gap-1"><button onClick={toggleVoice} disabled={!voiceSupported} className={`rounded-md p-2 ${isListening ? 'bg-destructive/10 text-destructive' : isSpeaking ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'} disabled:cursor-not-allowed disabled:opacity-40`} aria-label={!voiceSupported ? 'Voice input unsupported' : isListening ? 'Stop voice conversation' : 'Start voice conversation'}>{isListening ? <X className="size-4" /> : isSpeaking ? <Volume2 className="size-4" /> : <Mic className="size-4" />}</button><button onClick={submitCommand} className="rounded-md bg-primary p-2 text-primary-foreground hover:opacity-90" aria-label="Send command"><ArrowUp className="size-4" /></button></div></div>{(isListening || isSpeaking || voiceTranscript || !voiceSupported) && <div className="mt-3 rounded-md border border-border bg-muted/40 p-3 text-xs"><div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground"><span>{!voiceSupported ? 'Voice unavailable' : isListening ? 'Listening' : isSpeaking ? 'Nexus speaking' : 'Voice transcript'}</span>{(isListening || isSpeaking) && <span className="size-2 animate-pulse rounded-full bg-primary" />}</div>{!voiceSupported ? <p className="mt-2 text-muted-foreground">Your browser does not support speech recognition. Try Chrome or Edge.</p> : <p className="mt-2 leading-relaxed">{voiceTranscript || (isSpeaking ? voiceReply : 'Speak a command to Nexus.')}</p>}{isListening && <button onClick={toggleVoice} className="mt-3 inline-flex items-center gap-2 text-xs font-medium text-destructive hover:underline"><X className="size-3.5" /> Stop listening</button>}</div>}</div></div>
        </section>

        <aside className="hidden space-y-7 p-5 xl:block"><div><div className="mb-3 flex items-center justify-between"><h2 className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Connections</h2><button className="text-xs text-primary hover:underline">Manage</button></div><div className="space-y-2">{connections.map(({ name, detail, icon: Icon, state }) => <div key={name} className="flex items-center gap-3 rounded-md border border-border bg-card p-3"><div className="flex size-8 items-center justify-center rounded-md bg-muted"><Icon className="size-4 text-muted-foreground" /></div><div className="min-w-0 flex-1"><div className="text-sm font-medium">{name}</div><div className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><span className={`size-1.5 rounded-full ${state === 'connected' ? 'bg-emerald-500' : 'bg-muted-foreground/50'}`} />{detail}</div></div></div>)}</div></div>
          <div id="activity"><div className="mb-3 flex items-center gap-4 border-b border-border"><button onClick={() => setActiveTab('activity')} className={`pb-2 font-mono text-[10px] uppercase tracking-[0.14em] ${activeTab === 'activity' ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground'}`}>Activity</button><button onClick={() => setActiveTab('tasks')} className={`pb-2 font-mono text-[10px] uppercase tracking-[0.14em] ${activeTab === 'tasks' ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground'}`}>Tasks</button></div>{activeTab === 'activity' ? <div className="space-y-4">{[['10:42','Searched Gmail','3 results returned'],['10:40','Conversation opened','New session'],['09:18','Task completed','Weekly briefing']].map(([time,title,detail]) => <div className="flex gap-3" key={time}><div className="pt-0.5 font-mono text-[10px] text-muted-foreground">{time}</div><div><div className="text-xs font-medium">{title}</div><div className="mt-0.5 text-[11px] text-muted-foreground">{detail}</div></div></div>)}</div> : <div className="rounded-md border border-dashed border-border p-4 text-xs text-muted-foreground">No active tasks. Ask Nexus to create one.</div>}</div>
          <div className="rounded-lg bg-primary p-4 text-primary-foreground"><div className="flex items-center gap-2 text-xs font-medium"><LockKeyhole className="size-3.5" /> Privacy by default</div><p className="mt-2 text-[11px] leading-relaxed text-primary-foreground/70">Credentials stay server-side. Nexus only sees the tools and results it needs.</p></div>
        </aside>
      </div>
    </main>
  )
}

function MessageRow({ message }: { message: Message }) { return <div className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : ''}`}><div className={`max-w-2xl ${message.role === 'user' ? 'order-first rounded-lg bg-primary px-4 py-3 text-sm text-primary-foreground' : ''}`}>{message.role !== 'user' && <div className="mb-2 flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{message.role === 'system' ? <><LoaderCircle className="size-3 animate-spin" /> Tool execution</> : <><Sparkles className="size-3 text-primary" /> Nexus AI</>}</div>}<p className={message.role === 'system' ? 'font-mono text-xs text-muted-foreground' : 'text-sm leading-relaxed'}>{message.content}</p>{message.meta && <div className="mt-2 text-[11px] text-muted-foreground">{message.meta}</div>}</div></div> }

function ApprovalCard({ onApprove, onCancel }: { onApprove: () => void; onCancel: () => void }) { return <div className="max-w-2xl rounded-lg border border-amber-500/40 bg-amber-500/5 p-4"><div className="flex items-start gap-3"><div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-amber-500/15 text-amber-700"><LockKeyhole className="size-4" /></div><div className="flex-1"><div className="font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-amber-700">Action requires approval</div><div className="mt-3 grid gap-2 text-xs"><div><span className="text-muted-foreground">To:</span> Ahmed Hassan</div><div><span className="text-muted-foreground">Subject:</span> Re: Project Meeting</div><div><span className="text-muted-foreground">Message:</span> Hi Ahmed, Tuesday at 3 PM works for me.</div></div><div className="mt-4 flex gap-2"><button onClick={onApprove} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"><Check className="size-3.5" /> Approve & send</button><button onClick={onCancel} className="rounded-md border border-border bg-background px-3 py-2 text-xs hover:bg-muted">Cancel</button></div></div></div></div> }
