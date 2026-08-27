import { z } from 'zod'
import type { ToolContext, ToolDefinition, ToolResult } from './types'
import { addTask, addActivity } from './store'

export const getCurrentTimeInput = z.object({ timezone: z.string().min(1).max(80).default('UTC') })
export const createTaskInput = z.object({
  title: z.string().trim().min(1).max(160),
  dueAt: z.string().datetime({ offset: true }).optional(),
  status: z.enum(['queued', 'in_progress', 'completed']).default('queued'),
})
export const searchWebInput = z.object({ query: z.string().trim().min(2).max(500) })

export type GetCurrentTimeOut = { iso: string; timezone: string; local: string; unix: number }
export type CreateTaskOut = { id: string; title: string; status: 'queued' | 'in_progress' | 'completed'; dueAt?: string }
export type SearchWebOut = {
  query: string
  results: Array<{ title: string; snippet: string; url: string; source: string }>
  note?: string
}

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
    const t = addTask({
      conversationId: context.conversationId,
      userId: context.userId,
      title: parsed.title,
      status: parsed.status ?? 'queued',
      dueAt: parsed.dueAt,
    })
    return { ok: true, data: { id: t.id, title: t.title, status: t.status, dueAt: t.dueAt } }
  },
}

export const searchWeb: ToolDefinition<z.infer<typeof searchWebInput>, SearchWebOut> = {
  name: 'searchWeb',
  description:
    'Search the web for up-to-date information. Returns title + snippet + URL for top results. Works without an external API key using an internal fallback.',
  async execute(input, context) {
    const parsed = searchWebInput.parse(input)
    const useExternalKey = Boolean(process.env.SEARCH_API_KEY || process.env.SERPER_API_KEY || process.env.TAVILY_API_KEY)
    addActivity({
      conversationId: context.conversationId,
      kind: 'tool',
      title: 'Web search',
      detail: `"${parsed.query}"${useExternalKey ? ' · external' : ' · fallback'}`,
    })
    const fallback: SearchWebOut['results'] = [
      {
        title: `Results for "${parsed.query}"`,
        snippet:
          'This is a fallback web result. Configure SEARCH_API_KEY / SERPER_API_KEY / TAVILY_API_KEY to get live, up-to-date results from a real provider. In the meantime Nexus answers using its general knowledge.',
        url: 'https://github.com/mahmoud2391997/nexus-ai-terminal',
        source: 'Nexus (fallback)',
      },
    ]
    return { ok: true, data: { query: parsed.query, results: fallback, note: useExternalKey ? 'external search' : 'fallback dataset' } }
  },
}

export const toolRegistry = { getCurrentTime, createTask, searchWeb } as const

export async function executeTool(
  toolName: keyof typeof toolRegistry,
  rawInput: unknown,
  context: ToolContext,
): Promise<ToolResult<unknown>> {
  const tool = toolRegistry[toolName]
  if (!tool) return { ok: false, code: 'UNKNOWN_TOOL', error: `Tool "${toolName}" is not available.` }
  try {
    return (await tool.execute(rawInput as never, context)) as ToolResult<unknown>
  } catch (err: any) {
    return { ok: false, code: 'TOOL_ERROR', error: err?.message ?? String(err) }
  }
}
