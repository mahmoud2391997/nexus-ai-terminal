import { prisma } from "./db"
import type { ToolContext } from "../agent/types"

export type TaskStatus = 'queued' | 'in_progress' | 'completed'

export type Task = {
  id: string
  title: string
  status: TaskStatus
  dueAt?: string | null
  createdAt: string
  conversationId: string | null
  userId: string
}

export type ActivityEntry = {
  id: string
  time: string
  title: string
  detail: string
  kind: 'tool' | 'message' | 'system' | 'approval'
  conversationId?: string
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

export type Conversation = {
  id: string
  userId: string
  title: string | null
  createdAt: string
  updatedAt: string
  preview?: string
}

const nowTime = () =>
  new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit', hour12: false }).format(new Date())

export async function getOrCreateConversation(
  userId: string,
  title?: string,
  conversationId?: string,
): Promise<Conversation> {
  if (conversationId) {
    const existing = await prisma.conversation.findUnique({ where: { id: conversationId } })
    if (existing) {
      if (existing.userId !== userId) throw new Error('Conversation does not belong to this user.')
      return {
        id: existing.id,
        userId: existing.userId,
        title: existing.title,
        createdAt: existing.createdAt.toISOString(),
        updatedAt: existing.updatedAt.toISOString(),
      }
    }
  }
  const created = await prisma.conversation.create({
    data: { userId, title: title ?? 'New conversation' },
  })
  return {
    id: created.id,
    userId: created.userId,
    title: created.title,
    createdAt: created.createdAt.toISOString(),
    updatedAt: created.updatedAt.toISOString(),
  }
}

export async function canAccessConversation(userId: string, conversationId: string): Promise<boolean> {
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } })
  return Boolean(conversation && conversation.userId === userId)
}

export async function listConversations(userId: string): Promise<Conversation[]> {
  const conversations = await prisma.conversation.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    take: 20,
  })
  const ids = conversations.map((c) => c.id)
  const messages = ids.length
    ? await prisma.message.findMany({
        where: { conversationId: { in: ids } },
        orderBy: { createdAt: 'asc' },
        select: { conversationId: true, content: true },
      })
    : []
  const byConversation = new Map<string, string[]>()
  for (const m of messages) {
    const list = byConversation.get(m.conversationId) ?? []
    list.push(m.content)
    byConversation.set(m.conversationId, list)
  }
  return conversations.map((c) => {
    const content = (byConversation.get(c.id) ?? []).join(' ').trim()
    return {
      id: c.id,
      userId: c.userId,
      title: c.title,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      preview: content,
    }
  })
}

export async function addTask(task: Omit<Task, 'id' | 'createdAt'>): Promise<Task> {
  const created = await prisma.task.create({
    data: {
      userId: task.userId,
      conversationId: task.conversationId,
      title: task.title,
      status: task.status,
      dueAt: task.dueAt ? new Date(task.dueAt) : null,
    },
  })

  await prisma.auditLog.create({
    data: {
      userId: task.userId,
      conversationId: task.conversationId ?? undefined,
      actorType: 'ai',
      action: 'task_created',
      targetType: 'task',
      targetId: created.id,
      metadata: { title: task.title },
    },
  })

  return {
    id: created.id,
    title: created.title,
    status: created.status as TaskStatus,
    dueAt: created.dueAt?.toISOString() ?? null,
    createdAt: created.createdAt.toISOString(),
    conversationId: created.conversationId,
    userId: created.userId,
  }
}

export async function listTasks(conversationId: string): Promise<Task[]> {
  const tasks = await prisma.task.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'desc' },
  })

  return tasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status as TaskStatus,
    dueAt: t.dueAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
    conversationId: t.conversationId,
    userId: t.userId,
  }))
}

export async function listTasksByUser(userId: string): Promise<Task[]> {
  const tasks = await prisma.task.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  return tasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status as TaskStatus,
    dueAt: t.dueAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
    conversationId: t.conversationId,
    userId: t.userId,
  }))
}

export async function updateTaskStatus(
  userId: string,
  taskId: string,
  status: TaskStatus,
): Promise<Task | null> {
  const existing = await prisma.task.findUnique({ where: { id: taskId } })
  if (!existing || existing.userId !== userId) return null

  const updated = await prisma.task.update({ where: { id: taskId }, data: { status } })

  await prisma.auditLog.create({
    data: {
      userId,
      conversationId: existing.conversationId ?? undefined,
      actorType: 'user',
      action: 'task_status_updated',
      targetType: 'task',
      targetId: updated.id,
      metadata: { oldStatus: updated.status, newStatus: status },
    },
  })

  return {
    id: updated.id,
    title: updated.title,
    status: updated.status as TaskStatus,
    dueAt: updated.dueAt?.toISOString() ?? null,
    createdAt: updated.createdAt.toISOString(),
    conversationId: updated.conversationId,
    userId: updated.userId,
  }
}

export async function addActivity(entry: Omit<ActivityEntry, 'id' | 'time'>): Promise<ActivityEntry> {
  const id = `a_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  const span = new Intl.DateTimeFormat('en', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date())
  return { ...entry, id, time: entry.kind === 'approval' ? nowTime() : span }
}

type AuditLogLike = {
  action: string
  actorType: string
  targetType?: string | null
  targetId?: string | null
  metadata?: unknown
}

function describeActivityLog(log: AuditLogLike): { title: string; detail: string } {
  const md = (log.metadata ?? {}) as Record<string, unknown>
  const title = log.action.replace(/_/g, ' ')
  const parts: string[] = []

  if (log.action === 'task_created' && typeof md.title === 'string' && md.title) {
    parts.push(`Task: ${md.title}`)
  } else if (log.action === 'task_status_updated') {
    parts.push(`Status: ${String(md.oldStatus ?? '—')} → ${String(md.newStatus ?? '—')}`)
  } else if (log.action === 'approval_requested' && typeof md.toolName === 'string') {
    parts.push(`Approval requested for ${md.toolName}`)
  } else if (log.action.startsWith('approval_') && typeof md.toolName === 'string') {
    parts.push(`Approval ${log.action.replace('approval_', '').toUpperCase()} for ${md.toolName}`)
  } else if ((log.action === 'tool_completed' || log.action === 'tool_failed') && typeof md.toolName === 'string') {
    parts.push(`Tool: ${md.toolName}${md.ok === true ? ' · succeeded' : md.ok === false ? ' · failed' : ''}`)
  } else if (log.targetType) {
    parts.push(log.targetType)
  }

  if (log.targetId) parts.push(`ID: ${log.targetId}`)
  return { title, detail: parts.join(' · ') }
}

export async function listActivity(conversationId: string): Promise<ActivityEntry[]> {
  const logs = await prisma.auditLog.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  return logs.map((log) => {
    const { title, detail } = describeActivityLog(log)
    return {
      id: log.id,
      time: new Intl.DateTimeFormat('en', {
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(log.createdAt),
      title,
      detail,
      kind: 'system' as const,
      conversationId,
    }
  })
}

export async function listActivityByUser(userId: string): Promise<ActivityEntry[]> {
  const logs = await prisma.auditLog.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 80,
  })

  return logs.map((log) => {
    const { title, detail } = describeActivityLog(log)
    return {
      id: log.id,
      time: new Intl.DateTimeFormat('en', {
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(log.createdAt),
      title,
      detail,
      kind: 'system' as const,
      conversationId: log.conversationId ?? undefined,
    }
  })
}

export async function addPendingApproval(p: Omit<PendingApproval, 'id' | 'createdAt'>): Promise<PendingApproval> {
  const created = await prisma.approvalRequest.create({
    data: {
      userId: p.context.userId,
      toolExecutionId: null,
      actionType: p.toolName,
      payload: { input: p.input, summary: p.summary } as object,
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      conversationId: p.conversationId,
    },
  })

  await prisma.auditLog.create({
    data: {
      userId: p.context.userId,
      conversationId: p.conversationId || undefined,
      actorType: 'ai',
      action: 'approval_requested',
      targetType: 'approval',
      targetId: created.id,
      metadata: { toolName: p.toolName },
    },
  })

  return {
    id: created.id,
    toolName: p.toolName,
    input: p.input,
    summary: p.summary,
    createdAt: created.createdAt.toISOString(),
    conversationId: p.conversationId,
    context: p.context,
  }
}

function unwrapApprovalPayload(payload: unknown): { input: unknown; summary: PendingApproval['summary'] } {
  const raw = payload as Record<string, unknown> | null
  if (raw && typeof raw === 'object' && 'input' in raw && 'summary' in raw) {
    return { input: raw.input, summary: (raw.summary ?? {}) as PendingApproval['summary'] }
  }
  // Legacy rows stored the display summary directly.
  return { input: raw ?? {}, summary: (raw ?? {}) as PendingApproval['summary'] }
}

export async function getPendingApproval(
  userId: string,
  approvalId: string,
): Promise<PendingApproval | undefined> {
  const approval = await prisma.approvalRequest.findUnique({ where: { id: approvalId } })
  if (!approval || approval.userId !== userId || approval.status !== 'PENDING') return undefined

  const { input, summary } = unwrapApprovalPayload(approval.payload)
  return {
    id: approval.id,
    toolName: approval.actionType,
    input,
    summary,
    createdAt: approval.createdAt.toISOString(),
    conversationId: approval.conversationId ?? '',
    context: { userId: approval.userId, conversationId: approval.conversationId ?? '', requestId: '' },
  }
}

export async function listPendingApprovals(conversationId: string): Promise<PendingApproval[]> {
  const approvals = await prisma.approvalRequest.findMany({
    where: {
      conversationId,
      status: 'PENDING',
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  })

  return approvals.map((a) => {
    const { input, summary } = unwrapApprovalPayload(a.payload)
    return {
      id: a.id,
      toolName: a.actionType,
      input,
      summary,
      createdAt: a.createdAt.toISOString(),
      conversationId: a.conversationId ?? '',
      context: { userId: a.userId, conversationId: a.conversationId ?? '', requestId: '' },
    }
  })
}

export async function resolveApprovalStatus(
  userId: string,
  approvalId: string,
  status: 'APPROVED' | 'REJECTED' | 'EXPIRED',
): Promise<boolean> {
  const approval = await prisma.approvalRequest.findUnique({ where: { id: approvalId } })
  if (!approval || approval.userId !== userId || approval.status !== 'PENDING') return false

  await prisma.approvalRequest.update({
    where: { id: approvalId },
    data: {
      status,
      approvedAt: status === 'APPROVED' ? new Date() : null,
      rejectedAt: status === 'REJECTED' ? new Date() : null,
    },
  })

  await prisma.auditLog.create({
    data: {
      userId,
      conversationId: approval.conversationId ?? undefined,
      actorType: 'user',
      action: `approval_${status.toLowerCase()}`,
      targetType: 'approval',
      targetId: approvalId,
      metadata: { toolName: approval.actionType },
    },
  })

  return true
}

export async function addMessage(m: Omit<ChatMessage, 'id' | 'createdAt'>): Promise<ChatMessage> {
  const created = await prisma.message.create({
    data: {
      conversationId: m.conversationId,
      role: m.role,
      content: m.content,
      ...(m.toolName ? { toolCalls: { toolName: m.toolName } as object } : {}),
    },
  })

  return {
    id: created.id,
    role: created.role as ChatMessage['role'],
    content: created.content,
    meta: m.meta,
    createdAt: created.createdAt.toISOString(),
    conversationId: created.conversationId,
    toolName: m.toolName,
  }
}

export async function listMessages(conversationId: string): Promise<ChatMessage[]> {
  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
  })

  return messages.map((m) => {
    const toolName =
      typeof m.toolCalls === 'object' &&
      m.toolCalls !== null &&
      'toolName' in (m.toolCalls as Record<string, unknown>) &&
      typeof (m.toolCalls as Record<string, unknown>).toolName === 'string'
        ? ((m.toolCalls as Record<string, unknown>).toolName as string)
        : undefined

    return {
      id: m.id,
      role: m.role as ChatMessage['role'],
      content: m.content,
      createdAt: m.createdAt.toISOString(),
      conversationId: m.conversationId,
      toolName,
    }
  })
}

export async function getFullState(conversationId: string) {
  const [tasks, pendingApprovals, messages, activity] = await Promise.all([
    listTasks(conversationId),
    listPendingApprovals(conversationId),
    listMessages(conversationId),
    listActivity(conversationId),
  ])

  return { tasks, activity, pendingApprovals, messages }
}

export function genId(prefix = 'id'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}