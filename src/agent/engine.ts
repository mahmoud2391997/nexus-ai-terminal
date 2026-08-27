import { streamText } from 'ai'
import type { ToolContext, EngineEvent } from './types'
import { toolRegistry } from './tools'
import {
  addActivity,
  addMessage,
  getOrCreateConversation,
  getPendingApproval,
  listMessages,
  resolveApprovalStatus,
} from '../lib/store'
import { runTool } from './core/runner'
import { runAgentLoop } from './core/agentLoop'
import { getChatModel, systemPrompt } from '../lib/ai'

export type { EngineEvent }
export type { ActionPolicyInput } from './policy'

type AgentMessages = Array<{ role: 'system' | 'user' | 'assistant'; content: string }>

export function buildContext(conversationId: string, userId: string): ToolContext {
  return { conversationId, userId, requestId: `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` }
}

export type RunOptions = {
  conversationId: string
  userId: string
  userText: string
  onEvent?: (ev: EngineEvent) => void | Promise<void>
}

export async function runAgentStream(opts: RunOptions): Promise<{ reply: string }> {
  const { conversationId, userId, userText } = opts
  const ctx = buildContext(conversationId, userId)

  const emit = async (ev: EngineEvent) => {
    await opts.onEvent?.(ev)
  }

  const conversation = await getOrCreateConversation(userId, userText.slice(0, 80), conversationId)
  const convId = conversation.id

  await addMessage({ conversationId: convId, role: 'user', content: userText })
  await addActivity({ conversationId: convId, kind: 'message', title: 'You', detail: short(userText) })

  if (!getChatModel()) {
    const reply = 'AI provider is not configured. Add an OpenAI or Mistral API key to enable responses.'
    await addMessage({ conversationId: convId, role: 'assistant', content: reply })
    await emit({ type: 'assistant', content: reply })
    await emit({ type: 'done' })
    return { reply }
  }

  await emit({ type: 'thinking' })

  const history = await listMessages(convId)
  const result = await runAgentLoop({
    userId,
    conversationId: convId,
    context: ctx,
    history,
    userText,
    emit,
  })

  if (result.status === 'awaiting_approval') {
    return { reply: '' }
  }

  if (result.status === 'no_model') {
    const reply = 'AI provider is not configured. Add an OpenAI or Mistral API key to enable responses.'
    await addMessage({ conversationId: convId, role: 'assistant', content: reply })
    await emit({ type: 'assistant', content: reply })
    await emit({ type: 'done' })
    return { reply }
  }

  const reply = result.reply

  await addMessage({ conversationId: convId, role: 'assistant', content: reply })
  await addActivity({ conversationId: convId, kind: 'message', title: 'Nexus replied', detail: short(reply) })
  await emit({ type: 'assistant', content: reply })
  await emit({ type: 'done' })

  return { reply }
}

export async function streamAgentReply(
  messages: AgentMessages,
  emit: (ev: EngineEvent) => Promise<void>,
): Promise<string> {
  const model = getChatModel()
  if (!model) return ''

  const result = streamText({ model, system: systemPrompt, messages, toolChoice: 'none' })
  let acc = ''
  for await (const part of result.fullStream) {
    if (part.type === 'text-delta' && part.text) {
      acc += part.text
      await emit({ type: 'text', content: part.text })
    }
  }
  return acc.trim()
}

export async function resolveApproval(
  opts: { conversationId: string; approvalId: string; status: 'APPROVED' | 'REJECTED'; userId: string },
  onEvent?: (ev: EngineEvent) => void,
): Promise<{ ok: boolean; error?: string; status?: 'APPROVED' | 'REJECTED'; reply: string | null }> {
  const { conversationId, approvalId, status, userId } = opts
  const appr = await getPendingApproval(userId, approvalId)
  if (!appr) return { ok: false, error: 'Approval not found or already resolved.', reply: null }

  const emit = async (ev: EngineEvent) => {
    await onEvent?.(ev)
  }

  const resolved = await resolveApprovalStatus(userId, approvalId, status)
  if (!resolved) return { ok: false, error: 'Approval could not be resolved.', reply: null }

  await emit({ type: 'approval_resolved', approvalId, status })
  await addActivity({
    conversationId,
    kind: 'approval',
    title: `Approval ${status === 'APPROVED' ? 'approved' : 'rejected'}`,
    detail: appr.toolName,
  })

  if (status === 'REJECTED') {
    const reply = `Understood — I did not run "${appr.toolName}".`
    await addMessage({ conversationId, role: 'assistant', content: reply })
    await emit({ type: 'assistant', content: reply })
    await emit({ type: 'done' })
    return { ok: true, status, reply }
  }

  const ctx = buildContext(conversationId, userId)

  await emit({ type: 'tool_call', toolName: appr.toolName, input: appr.input })
  const res = await runTool(appr.toolName as keyof typeof toolRegistry, appr.input, ctx)

  await emit({
    type: 'tool_result',
    toolName: appr.toolName,
    ok: res.ok,
    data: res.ok ? res.data : undefined,
    error: res.ok ? undefined : res.error,
  })

  await addMessage({
    conversationId,
    role: 'tool',
    content: JSON.stringify(res.ok ? res.data : { ok: false, error: res.error }),
    toolName: appr.toolName,
  })

  const history = await listMessages(conversationId)
  const messages: AgentMessages = []
  for (const m of history) {
    if (m.role === 'user') messages.push({ role: 'user', content: m.content })
    else if (m.role === 'assistant') messages.push({ role: 'assistant', content: m.content })
    else if (m.role === 'tool') {
      const label = m.toolName ? `[tool ${m.toolName}]` : '[tool]'
      messages.push({ role: 'user', content: `${label} result:\n${m.content}` })
    }
  }

  const model = getChatModel()
  const reply = model
    ? await streamAgentReply(messages, emit)
    : res.ok
      ? `Done. ${appr.toolName} completed.`
      : `${appr.toolName} failed: ${res.error}`

  await addMessage({ conversationId, role: 'assistant', content: reply })
  await addActivity({ conversationId, kind: 'message', title: 'Nexus replied', detail: short(reply) })
  await emit({ type: 'assistant', content: reply })
  await emit({ type: 'done' })
  return { ok: true, status, reply }
}

export function short(text: string): string {
  return text.length > 80 ? text.slice(0, 80) + '…' : text
}
