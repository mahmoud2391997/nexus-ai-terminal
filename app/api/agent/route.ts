import { NextResponse } from 'next/server'
import { createTaskInput, getCurrentTimeInput, searchWebInput } from '@/src/agent/tools'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object' || !('tool' in body)) return NextResponse.json({ error: 'A tool name is required.' }, { status: 400 })
  const schemas = { getCurrentTime: getCurrentTimeInput, createTask: createTaskInput, searchWeb: searchWebInput }
  const schema = schemas[(body as { tool: keyof typeof schemas }).tool]
  if (!schema) return NextResponse.json({ error: 'Tool unavailable.' }, { status: 404 })
  const parsed = schema.safeParse((body as { input?: unknown }).input)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid tool input.', issues: parsed.error.issues }, { status: 422 })
  return NextResponse.json({ ok: true, tool: (body as { tool: string }).tool, input: parsed.data, status: 'accepted' })
}
