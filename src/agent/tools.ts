import { z } from 'zod'
import type { ToolContext, ToolDefinition, ToolResult } from './types'
import { addTask, addActivity } from './store'
import { sendGmailEmail } from '@/src/lib/gmail'
import { createGoogleCalendarEvent } from '@/src/lib/calendar'

export const getCurrentTimeInput = z.object({ timezone: z.string().min(1).max(80).default('UTC') })
export const createTaskInput = z.object({
  title: z.string().trim().min(1).max(160),
  dueAt: z.string().datetime({ offset: true }).optional(),
  status: z.enum(['queued', 'in_progress', 'completed']).default('queued'),
})
export const searchWebInput = z.object({ query: z.string().trim().min(2).max(500) })
export const sendEmailInput = z.object({
  to: z.string().email('A valid recipient email address is required.'),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20000),
})
export const createCalendarEventInput = z.object({
  title: z.string().trim().min(1).max(200),
  startDateTime: z.string().trim().min(4).max(40),
  timeZone: z.string().trim().min(1).max(80).optional(),
  endDateTime: z.string().trim().min(4).max(40).optional(),
  durationMinutes: z.number().int().min(1).max(1440).optional(),
  description: z.string().trim().max(5000).optional(),
})

export type GetCurrentTimeOut = { iso: string; timezone: string; local: string; unix: number }
export type CreateTaskOut = { id: string; title: string; status: 'queued' | 'in_progress' | 'completed'; dueAt?: string }
export type SearchWebOut = {
  query: string
  results: Array<{ title: string; snippet: string; url: string; source: string }>
  note?: string
}
export type SendEmailOut = { messageId: string; to: string; subject: string }
export type CreateCalendarEventOut = { id: string; htmlLink: string; title: string; start: string; timeZone: string }

export const getCurrentTime: ToolDefinition<z.infer<typeof getCurrentTimeInput>, GetCurrentTimeOut> = {
  name: 'getCurrentTime',
  description: "Return the current time for a specific IANA timezone (e.g. 'UTC', 'America/New_York', 'Asia/Jerusalem').",
  async execute(input) {
    const parsed = getCurrentTimeInput.parse(input)
    try {
      const local = new Intl.DateTimeFormat('en-US', {
        timeZone: parsed.timezone,
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short',
      }).format(new Date())
      return { ok: true, data: { iso: new Date().toISOString(), timezone: parsed.timezone, local, unix: Math.floor(Date.now() / 1000) } }
    } catch {
      return { ok: false, code: 'INVALID_TIMEZONE', error: `Unknown or invalid timezone: ${parsed.timezone}. Use an IANA timezone like 'UTC' or 'Europe/London'.` }
    }
  },
}

export const createTask: ToolDefinition<z.infer<typeof createTaskInput>, CreateTaskOut> = {
  name: 'createTask',
  description: 'Create a queued task / to-do item. Requires user approval before it is saved.',
  requiresApproval: true,
  async execute(input, context: ToolContext) {
    const parsed = createTaskInput.parse(input)
    if (!context.userId) return { ok: false, code: 'UNAUTHENTICATED', error: 'A user session is required.' }
    const t = await addTask({
      conversationId: context.conversationId,
      userId: context.userId,
      title: parsed.title,
      status: parsed.status ?? 'queued',
      dueAt: parsed.dueAt,
    })
    return { ok: true, data: { id: t.id, title: t.title, status: t.status, dueAt: t.dueAt ?? undefined } }
  },
}

async function performWebSearch(query: string): Promise<SearchWebOut['results']> {
  const serperKey = process.env.SERPER_API_KEY || process.env.WEB_SEARCH_API_KEY
  const tavilyKey = process.env.TAVILY_API_KEY

  if (serperKey) {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': serperKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, num: 6 }),
    })
    if (!res.ok) throw new Error(`Serper search failed with status ${res.status}`)
    const data = (await res.json()) as { organic?: Array<{ title?: string; snippet?: string; link?: string }> }
    const results = (data.organic ?? []).map((r) => ({
      title: r.title ?? 'Untitled',
      snippet: r.snippet ?? '',
      url: r.link ?? '',
      source: 'Serper',
    }))
    if (results.length > 0) return results
  }

  if (tavilyKey) {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: tavilyKey, query, max_results: 6 }),
    })
    if (!res.ok) throw new Error(`Tavily search failed with status ${res.status}`)
    const data = (await res.json()) as { results?: Array<{ title?: string; content?: string; url?: string }> }
    const results = (data.results ?? []).map((r) => ({
      title: r.title ?? 'Untitled',
      snippet: r.content ?? '',
      url: r.url ?? '',
      source: 'Tavily',
    }))
    if (results.length > 0) return results
  }

  return []
}

async function searchWebImpl(parsed: { query: string }, context: ToolContext): Promise<SearchWebOut> {
  const hasExternalKey = Boolean(
    process.env.SERPER_API_KEY || process.env.WEB_SEARCH_API_KEY || process.env.TAVILY_API_KEY,
  )
  addActivity({
    conversationId: context.conversationId,
    kind: 'tool',
    title: 'Web search',
    detail: `"${parsed.query}"${hasExternalKey ? ' · external' : ' · fallback'}`,
  })

  const fallback: SearchWebOut['results'] = [
    {
      title: `Results for "${parsed.query}"`,
      snippet:
        'This is a fallback web result. Configure SERPER_API_KEY / TAVILY_API_KEY to get live, up-to-date results from a real provider. In the meantime Nexus answers using its general knowledge.',
      url: 'https://github.com/mahmoud2391997/nexus-ai-terminal',
      source: 'Nexus (fallback)',
    },
  ]

  if (hasExternalKey) {
    try {
      const results = await performWebSearch(parsed.query)
      if (results.length > 0) {
        return { ok: true, data: { query: parsed.query, results, note: 'external search' } }
      }
    } catch {
      // fall through to fallback on provider error
    }
  }

  return { ok: true, data: { query: parsed.query, results: fallback, note: hasExternalKey ? 'external search (empty)' : 'fallback dataset' } }
}

export const searchWeb: ToolDefinition<z.infer<typeof searchWebInput>, SearchWebOut> = {
  name: 'searchWeb',
  description:
    'Search the web for up-to-date information. Returns title + snippet + URL for top results. Works without an external API key using an internal fallback.',
  async execute(input, context) {
    const parsed = searchWebInput.parse(input)
    return searchWebImpl(parsed, context)
  },
}

export const sendEmail: ToolDefinition<z.infer<typeof sendEmailInput>, SendEmailOut> = {
  name: 'sendEmail',
  description:
    'Send an email via Gmail to a recipient. Requires the user to have connected Gmail, and requires explicit user approval before the email is sent.',
  requiresApproval: true,
  async execute(input, context: ToolContext) {
    const parsed = sendEmailInput.parse(input)
    if (!context.userId) return { ok: false, code: 'UNAUTHENTICATED', error: 'A user session is required.' }
    const result = await sendGmailEmail(context.userId, {
      to: parsed.to,
      subject: parsed.subject,
      body: parsed.body,
    })
    addActivity({
      conversationId: context.conversationId,
      kind: 'tool',
      title: 'Sent email',
      detail: `to ${parsed.to} · ${parsed.subject}`,
    })
    return { ok: true, data: { messageId: result.messageId, to: parsed.to, subject: parsed.subject } }
  },
}

export const createCalendarEvent: ToolDefinition<z.infer<typeof createCalendarEventInput>, CreateCalendarEventOut> = {
  name: 'createCalendarEvent',
  description:
    'Create an event on the user\'s Google Calendar. Requires a connected Google Calendar, and requires explicit user approval before the event is created. startDateTime is an RFC3339/ISO date-time (e.g. "2026-08-30T15:00:00"); provide an IANA timeZone (e.g. "Africa/Cairo") so the time is interpreted correctly.',
  requiresApproval: true,
  async execute(input, context: ToolContext) {
    const parsed = createCalendarEventInput.parse(input)
    if (!context.userId) return { ok: false, code: 'UNAUTHENTICATED', error: 'A user session is required.' }
    const result = await createGoogleCalendarEvent(context.userId, {
      title: parsed.title,
      startDateTime: parsed.startDateTime,
      timeZone: parsed.timeZone,
      endDateTime: parsed.endDateTime,
      durationMinutes: parsed.durationMinutes,
      description: parsed.description,
    })
    addActivity({
      conversationId: context.conversationId,
      kind: 'tool',
      title: 'Created calendar event',
      detail: `${parsed.title} · ${parsed.startDateTime}`,
    })
    return {
      ok: true,
      data: {
        id: result.id,
        htmlLink: result.htmlLink,
        title: parsed.title,
        start: parsed.startDateTime,
        timeZone: parsed.timeZone ?? 'UTC',
      },
    }
  },
}

export const toolRegistry = { getCurrentTime, createTask, searchWeb, sendEmail, createCalendarEvent } as const

export async function executeTool(
  toolName: keyof typeof toolRegistry,
  rawInput: unknown,
  context: ToolContext,
): Promise<ToolResult<unknown>> {
  const tool = toolRegistry[toolName]
  if (!tool) return { ok: false, code: 'UNKNOWN_TOOL', error: `Tool "${toolName}" is not available.` }
  try {
    return (await tool.execute(rawInput as never, context)) as ToolResult<unknown>
  } catch (err: unknown) {
    const message = err instanceof Error && err.message ? err.message : String(err)
    return { ok: false, code: 'TOOL_ERROR', error: message }
  }
}
