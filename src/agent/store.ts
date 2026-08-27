import type { ToolContext } from './types'

export type Task = {
  id: string
  title: string
  status: 'queued' | 'in_progress' | 'completed'
  dueAt?: string
  createdAt: string
  conversationId: string
  userId: string
}

export type ActivityEntry = {
  id: string
  time: string
  title: string
  detail: string
  kind: 'tool' | 'message' | 'system' | 'approval'
  conversationId: string
}

export type PendingApproval = {
  id: string
  toolName: string
  input: unknown
  summary: { to?: string; subject?: string; message?: string; title?: string; description?: string }
  createdAt: string
  conversationId: string
  context: ToolContext
}

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  meta?: string
  createdAt: string
  conversationId: string
  toolName?: string
}

type ConversationState = {
  tasks: Task[]
  activity: ActivityEntry[]
  pendingApprovals: PendingApproval[]
  messages: ChatMessage[]
}

const store = new Map<string, ConversationState>()

function getConv(conversationId: string): ConversationState {
  let conv = store.get(conversationId)
  if (!conv) {
    conv = { tasks: [], activity: [], pendingApprovals: [], messages: [] }
    store.set(conversationId, conv)
  }
  return conv
}

const nowTime = () =>
  new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit', hour12: false }).format(new Date())

export function addTask(task: Omit<Task, 'id' | 'createdAt'>) {
  const conv = getConv(task.conversationId)
  const t: Task = { ...task, id: `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, createdAt: new Date().toISOString() }
  conv.tasks.unshift(t)
  addActivity({ conversationId: task.conversationId, kind: 'tool', title: 'Task created', detail: t.title })
  return t
}

export function listTasks(conversationId: string) {
  return getConv(conversationId).tasks
}

export function updateTaskStatus(conversationId: string, taskId: string, status: Task['status']) {
  const conv = getConv(conversationId)
  const t = conv.tasks.find((x) => x.id === taskId)
  if (t) t.status = status
  return t
}

export function addActivity(entry: Omit<ActivityEntry, 'id' | 'time'>) {
  const conv = getConv(entry.conversationId)
  const a: ActivityEntry = { ...entry, id: `a_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, time: nowTime() }
  conv.activity.unshift(a)
  return a
}

export function listActivity(conversationId: string) {
  return getConv(conversationId).activity
}

export function addPendingApproval(p: Omit<PendingApproval, 'id' | 'createdAt'>) {
  const conv = getConv(p.conversationId)
  const app: PendingApproval = { ...p, id: `ap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, createdAt: new Date().toISOString() }
  conv.pendingApprovals.unshift(app)
  addActivity({ conversationId: p.conversationId, kind: 'approval', title: 'Approval requested', detail: p.toolName })
  return app
}

export function getPendingApproval(conversationId: string, approvalId: string) {
  return getConv(conversationId).pendingApprovals.find((x) => x.id === approvalId)
}

export function listPendingApprovals(conversationId: string) {
  return getConv(conversationId).pendingApprovals.filter((x) => true)
}

export function removePendingApproval(conversationId: string, approvalId: string) {
  const conv = getConv(conversationId)
  conv.pendingApprovals = conv.pendingApprovals.filter((x) => x.id !== approvalId)
}

export function addMessage(m: Omit<ChatMessage, 'id' | 'createdAt'>) {
  const conv = getConv(m.conversationId)
  const msg: ChatMessage = { ...m, id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, createdAt: new Date().toISOString() }
  conv.messages.push(msg)
  return msg
}

export function listMessages(conversationId: string) {
  return getConv(conversationId).messages
}

export function getFullState(conversationId: string) {
  const conv = getConv(conversationId)
  return {
    tasks: conv.tasks,
    activity: conv.activity,
    pendingApprovals: conv.pendingApprovals,
    messages: conv.messages,
  }
}

export function genId(prefix = 'id'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}
