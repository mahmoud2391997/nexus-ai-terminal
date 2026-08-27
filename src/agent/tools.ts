import { z } from 'zod'
import type { ToolContext, ToolDefinition } from './types'

export const getCurrentTimeInput = z.object({ timezone: z.string().min(1).max(80).default('UTC') })
export const createTaskInput = z.object({ title: z.string().trim().min(1).max(160), dueAt: z.string().datetime().optional() })
export const searchWebInput = z.object({ query: z.string().trim().min(2).max(500) })

export const getCurrentTime: ToolDefinition<z.infer<typeof getCurrentTimeInput>, { iso: string; timezone: string }> = { name: 'getCurrentTime', description: 'Return the current time for a specific IANA timezone.', async execute(input) { const parsed = getCurrentTimeInput.parse(input); return { ok: true, data: { iso: new Date().toISOString(), timezone: parsed.timezone } } } }
export const createTask: ToolDefinition<z.infer<typeof createTaskInput>, { title: string; status: 'queued' }> = { name: 'createTask', description: 'Create a task for the authenticated user after approval.', requiresApproval: true, async execute(input, context: ToolContext) { const parsed = createTaskInput.parse(input); if (!context.userId) return { ok: false, code: 'UNAUTHENTICATED', error: 'A user session is required.' }; return { ok: true, data: { title: parsed.title, status: 'queued' } } } }
export const searchWeb: ToolDefinition<z.infer<typeof searchWebInput>, { query: string; available: boolean }> = { name: 'searchWeb', description: 'Search the web through a configured server-side provider.', async execute(input) { const parsed = searchWebInput.parse(input); return { ok: true, data: { query: parsed.query, available: Boolean(process.env.SEARCH_API_KEY) } } } }

export const toolRegistry = { getCurrentTime, createTask, searchWeb } as const
