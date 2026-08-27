import { prisma } from '@/src/lib/db'
import type { ToolContext, ToolResult } from '../types'
import { createCalendarEventInput, createTaskInput, getCurrentTimeInput, searchWebInput, sendEmailInput, toolRegistry } from '../tools'
import {
  buildIdempotencyKey,
  createToolExecution,
  findCompletedByIdempotency,
  finishExecution,
  transitionExecution,
} from './execution'
import { z } from 'zod'

export type RunToolResult = {
  ok: boolean
  deduped?: boolean
  executionId?: string
  data?: unknown
  error?: string
}

const IDEMPOTENT_TOOLS = new Set(['createTask', 'sendEmail', 'sendTelegramMessage', 'createCalendarEvent', 'initiatePhoneCall'])

export async function runTool(
  toolName: keyof typeof toolRegistry,
  rawInput: unknown,
  context: ToolContext,
): Promise<RunToolResult> {
  const tool = toolRegistry[toolName]
  if (!tool) return { ok: false, error: `Tool "${toolName}" is not available.` }

  const input = validateToolInput(toolName, rawInput)
  if (input === null) return { ok: false, error: `Invalid input for tool "${toolName}".` }

  const idempotencyKey = IDEMPOTENT_TOOLS.has(toolName)
    ? buildIdempotencyKey(context.userId, toolName, input)
    : undefined

  const execution = await createToolExecution({
    userId: context.userId,
    conversationId: context.conversationId,
    toolName,
    input,
    idempotencyKey,
  })

  // §22: short-circuit a retried external-effect call to its stored result.
  if (idempotencyKey) {
    const existing = await findCompletedByIdempotency(context.userId, idempotencyKey)
    if (existing) {
      return { ok: true, deduped: true, executionId: existing.id, data: existing.output }
    }
  }

  await transitionExecution(context.userId, execution.id, 'PENDING', 'RUNNING')

  let result: ToolResult<unknown>
  try {
    result = (await tool.execute(input as never, context)) as ToolResult<unknown>
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await failExecution(context.userId, execution.id, message)
    return { ok: false, executionId: execution.id, error: message }
  }

  if (!result.ok) {
    await failExecution(context.userId, execution.id, result.error)
    return { ok: false, executionId: execution.id, error: result.error }
  }

  await finishExecution(context.userId, execution.id, result.data)

  await prisma.auditLog.create({
    data: {
      userId: context.userId,
      actorType: 'ai',
      action: 'tool_completed',
      targetType: 'tool_execution',
      targetId: execution.id,
      metadata: { toolName, ok: true },
    },
  })

  return { ok: true, executionId: execution.id, data: result.data }
}

async function failExecution(userId: string, executionId: string, error: string): Promise<void> {
  await finishExecution(userId, executionId, null, error)
  await prisma.auditLog.create({
    data: {
      userId,
      actorType: 'ai',
      action: 'tool_failed',
      targetType: 'tool_execution',
      targetId: executionId,
      metadata: { error },
    },
  })
}

function validateToolInput(toolName: keyof typeof toolRegistry, raw: unknown): unknown | null {
  const schema = schemaForTool(toolName)
  if (!schema) return raw
  const parsed = schema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

function schemaForTool(toolName: keyof typeof toolRegistry): z.ZodType | null {
  switch (toolName) {
    case 'getCurrentTime':
      return getCurrentTimeInput
    case 'createTask':
      return createTaskInput
    case 'searchWeb':
      return searchWebInput
    case 'sendEmail':
      return sendEmailInput
    case 'createCalendarEvent':
      return createCalendarEventInput
    default:
      return null
  }
}