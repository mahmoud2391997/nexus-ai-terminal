import { NextResponse } from 'next/server'
import { createTaskInput, getCurrentTimeInput, searchWebInput, executeTool } from '@/src/agent/tools'
import { buildContext } from '@/src/agent/engine'
import { evaluateToolPolicy } from '@/src/agent/policy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ReqBody = { tool?: string; input?: unknown; conversationId?: string; userId?: string }

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as ReqBody | null
  if (!body || typeof body !== 'object' || typeof body.tool !== 'string') {
    return NextResponse.json({ error: 'A tool name is required.' }, { status: 400 })
  }
  const schemas = {
    getCurrentTime: getCurrentTimeInput,
    createTask: createTaskInput,
    searchWeb: searchWebInput,
  } as const
  const toolName = body.tool as keyof typeof schemas
  const schema = schemas[toolName]
  if (!schema) return NextResponse.json({ error: 'Tool unavailable.' }, { status: 404 })
  const policy = evaluateToolPolicy(toolName)
  if (!policy.allowed) return NextResponse.json({ error: policy.reason ?? 'Blocked by policy.' }, { status: 403 })
  const parsed = schema.safeParse(body.input ?? {})
  if (!parsed.success) return NextResponse.json({ error: 'Invalid tool input.', issues: parsed.error.issues }, { status: 422 })
  if (policy.requiresApproval) {
    return NextResponse.json({
      ok: true,
      tool: body.tool,
      input: parsed.data,
      status: 'WAITING_APPROVAL' as const,
      message: 'This tool requires explicit user approval before execution. Use /api/approve after collecting approval.',
    })
  }
  const conversationId = body.conversationId ?? `conv_adhoc_${Date.now()}`
  const ctx = buildContext(conversationId, body.userId)
  const result = await executeTool(toolName, parsed.data, ctx)
  return NextResponse.json({
    ok: result.ok,
    tool: body.tool,
    input: parsed.data,
    status: result.ok ? ('COMPLETED' as const) : ('FAILED' as const),
    data: result.ok ? result.data : undefined,
    error: result.ok ? undefined : (result as any).error,
  })
}
