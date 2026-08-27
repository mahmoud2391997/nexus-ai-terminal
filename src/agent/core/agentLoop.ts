import { streamText, tool, zodSchema } from 'ai'
import { buildSystemPrompt, getChatModel } from '@/src/lib/ai'
import { createCalendarEventInput, createTaskInput, getCurrentTimeInput, searchWebInput, sendEmailInput } from '../tools'
import type { ToolContext } from '../types'
import { runTool } from './runner'
import { addPendingApproval, type ChatMessage } from '../../lib/store'
import type { EngineEvent } from '../types'

export type AgentLoopResult =
  | { status: 'done'; reply: string }
  | { status: 'awaiting_approval' }
  | { status: 'no_model' }

const MAX_STEPS = 5

const APPROVAL_TOOLS = new Set(['createTask', 'sendEmail', 'createCalendarEvent'])

type AgentMessages = Array<{ role: 'system' | 'user' | 'assistant'; content: string }>

const agentTools = {
  getCurrentTime: tool({
    description:
      "Get the current time and date for a specific IANA timezone (e.g. 'UTC', 'America/New_York', 'Asia/Jerusalem').",
    inputSchema: zodSchema(getCurrentTimeInput),
  }),
  searchWeb: tool({
    description: 'Search the web for up-to-date information. Returns the top results with title, snippet and URL.',
    inputSchema: zodSchema(searchWebInput),
  }),
  sendEmail: tool({
    description:
      'Send an email via Gmail to a recipient. This action requires explicit user approval and a connected Gmail account.',
    inputSchema: zodSchema(sendEmailInput),
  }),
  createCalendarEvent: tool({
    description:
      'Schedule/create a calendar event or appointment (e.g. "schedule an interview", "book a meeting", "add an event to my calendar"). Use THIS tool for any calendar scheduling request — do not use createTask for scheduling. Requires a connected Google Calendar and explicit user approval. startDateTime is the LOCAL wall-clock time the user stated, expressed in the given IANA timeZone (e.g. Africa/Cairo). IMPORTANT: use the user\'s stated local time VERBATIM — if they say "3 pm", use startDateTime "2026-08-30T15:00:00" with timeZone "Africa/Cairo". Do NOT add or subtract a timezone offset to their stated time; the calendar tool applies the timezone.',
    inputSchema: zodSchema(createCalendarEventInput),
  }),
  createTask: tool({
    description:
      'Create a new task / to-do item for tracking or reminders (e.g. "add a task", "remind me to"). Do NOT use this for calendar scheduling — use createCalendarEvent for events/appointments. This action requires explicit user approval before it is saved.',
    inputSchema: zodSchema(createTaskInput),
  }),
}

function historyToMessages(history: ChatMessage[], userText: string): AgentMessages {
  const messages: AgentMessages = []

  for (const m of history) {
    if (m.role === 'user') {
      messages.push({ role: 'user', content: m.content })
    } else if (m.role === 'assistant') {
      messages.push({ role: 'assistant', content: m.content })
    } else if (m.role === 'tool') {
      const label = m.toolName ? `[tool ${m.toolName}]` : '[tool]'
      messages.push({ role: 'user', content: `${label} result:\n${m.content}` })
    }
    // system messages are intentionally not exposed to the model here
  }

  const hasUser = messages.some((m) => m.role === 'user' && m.content === userText)
  if (!hasUser) messages.push({ role: 'user', content: userText })

  return messages
}

export async function runAgentLoop(opts: {
  userId: string
  conversationId: string
  context: ToolContext
  history: ChatMessage[]
  userText: string
  emit: (ev: EngineEvent) => void | Promise<void>
}): Promise<AgentLoopResult> {
  const { conversationId, context, history, userText, emit } = opts
  const model = getChatModel()
  if (!model) return { status: 'no_model' }

  const messages = historyToMessages(history, userText)
  const system = buildSystemPrompt()

  for (let step = 0; step < MAX_STEPS; step++) {
    let streamedText = ''
    const toolCalls: Array<{ name: string; input: unknown }> = []

    const result = streamText({
      model,
      system,
      messages,
      tools: agentTools,
      toolChoice: 'auto',
    })

    for await (const part of result.fullStream) {
      if (part.type === 'text-delta') {
        if (part.text) {
          streamedText += part.text
          await emit({ type: 'text', content: part.text })
        }
      } else if (part.type === 'tool-call') {
        toolCalls.push({ name: part.toolName, input: part.input })
      }
    }

    if (toolCalls.length === 0) {
      const reply = streamedText.trim()
      return { status: 'done', reply }
    }

    let advanced = false
    for (const call of toolCalls) {
      if (!isKnownTool(call.name)) continue

      if (APPROVAL_TOOLS.has(call.name)) {
        await requestApproval({
          conversationId,
          context,
          toolName: call.name,
          input: call.input,
          emit,
        })
        return { status: 'awaiting_approval' }
      }

      await emit({ type: 'tool_call', toolName: call.name, input: call.input })
      const res = await runTool(call.name as never, call.input, context)

      if (res.ok) {
        await emit({
          type: 'tool_result',
          toolName: call.name,
          ok: true,
          data: res.data,
        })
        messages.push({
          role: 'user',
          content: `[tool ${call.name} result]\n${JSON.stringify(res.data)}`,
        })
      } else {
        await emit({
          type: 'tool_result',
          toolName: call.name,
          ok: false,
          error: res.error,
        })
        messages.push({
          role: 'user',
          content: `[tool ${call.name} failed]\n${JSON.stringify({ error: res.error })}`,
        })
      }
      advanced = true
      void streamedText
    }

    if (!advanced) break
    const assistantText = streamedText.trim()
    if (assistantText) {
      messages.push({ role: 'assistant', content: assistantText })
    }
  }

  return { status: 'done', reply: '' }
}

async function requestApproval(opts: {
  conversationId: string
  context: ToolContext
  toolName: string
  input: unknown
  emit: (ev: EngineEvent) => void | Promise<void>
}): Promise<void> {
  const { conversationId, context, toolName, input, emit } = opts
  const raw = input as Record<string, unknown>

  let summary: Record<string, string | undefined>
  if (toolName === 'sendEmail') {
    summary = {
      to: typeof raw.to === 'string' ? raw.to : undefined,
      subject: typeof raw.subject === 'string' ? raw.subject : undefined,
      message: `Send email to "${raw.to}"`,
    }
  } else if (toolName === 'createCalendarEvent') {
    summary = {
      title: typeof raw.title === 'string' ? raw.title : undefined,
      message: `Create calendar event "${raw.title}"`,
    }
  } else {
    const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : toolName
    summary = { title, message: `Run ${toolName}` }
  }

  const approval = await addPendingApproval({
    conversationId,
    toolName,
    input,
    summary,
    context,
  })

  await emit({
    type: 'approval_requested',
    approvalId: approval.id,
    toolName,
    summary,
  })
}

function isKnownTool(name: string): boolean {
  return (
    name === 'getCurrentTime' ||
    name === 'createTask' ||
    name === 'searchWeb' ||
    name === 'sendEmail' ||
    name === 'createCalendarEvent'
  )
}
