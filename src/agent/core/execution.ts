import { prisma } from '@/src/lib/db'
import { hashToken } from '@/src/lib/encryption'

export type ExecutionStatus = 'PENDING' | 'RUNNING' | 'WAITING_APPROVAL' | 'COMPLETED' | 'FAILED'

// §22: enforce transitions in one place. No scattered status writes.
const ALLOWED_TRANSITIONS: Record<ExecutionStatus, ExecutionStatus[]> = {
  PENDING: ['RUNNING'],
  RUNNING: ['WAITING_APPROVAL', 'COMPLETED', 'FAILED'],
  WAITING_APPROVAL: ['RUNNING', 'FAILED'],
  COMPLETED: [],
  FAILED: [],
}

export function transition(from: ExecutionStatus, to: ExecutionStatus): void {
  if (from === to) return
  if (!ALLOWED_TRANSITIONS[from]?.includes(to)) {
    throw new Error(`Illegal ToolExecution transition: ${from} -> ${to}`)
  }
}

export type NewExecution = {
  userId: string
  conversationId: string
  toolName: string
  input: unknown
  idempotencyKey?: string
}

export type ExecutionRecord = {
  id: string
  status: ExecutionStatus
  output: unknown
  error?: string | null
}

export async function createToolExecution(data: NewExecution): Promise<ExecutionRecord> {
  const created = await prisma.toolExecution.create({
    data: {
      userId: data.userId,
      conversationId: data.conversationId,
      toolName: data.toolName,
      input: data.input as object,
      status: 'PENDING',
      idempotencyKey: data.idempotencyKey ?? null,
    },
  })
  return { id: created.id, status: created.status as ExecutionStatus, output: created.output }
}

export type TransitionTarget = ExecutionStatus

export async function transitionExecution(
  userId: string,
  executionId: string,
  current: TransitionTarget,
  next: TransitionTarget,
): Promise<boolean> {
  transition(current, next)
  const updated = await prisma.toolExecution.updateMany({
    where: { id: executionId, userId, status: current },
    data: {
      status: next,
      startedAt: current === 'PENDING' && next === 'RUNNING' ? new Date() : undefined,
      completedAt: next === 'COMPLETED' || next === 'FAILED' ? new Date() : undefined,
    },
  })
  return updated.count > 0
}

export async function finishExecution(
  userId: string,
  executionId: string,
  output: unknown,
  error?: string,
): Promise<boolean> {
  const record = await prisma.toolExecution.findUnique({ where: { id: executionId } })
  if (!record || record.userId !== userId) return false

  if (error) {
    transition(record.status as ExecutionStatus, 'FAILED')
    await prisma.toolExecution.update({
      where: { id: executionId },
      data: { status: 'FAILED', error, completedAt: new Date() },
    })
    return true
  }

  transition(record.status as ExecutionStatus, 'COMPLETED')
  await prisma.toolExecution.update({
    where: { id: executionId },
    data: { status: 'COMPLETED', output: output as object, completedAt: new Date() },
  })
  return true
}

export async function findCompletedByIdempotency(
  userId: string,
  idempotencyKey: string,
): Promise<ExecutionRecord | null> {
  const record = await prisma.toolExecution.findFirst({
    where: { userId, idempotencyKey, status: 'COMPLETED' },
    orderBy: { completedAt: 'desc' },
  })
  if (!record) return null
  return { id: record.id, status: 'COMPLETED', output: record.output, error: null }
}

export function buildIdempotencyKey(userId: string, toolName: string, input: unknown): string {
  return hashToken(`${userId}:${toolName}:${JSON.stringify(input ?? {})}`)
}