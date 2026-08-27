import { NextResponse } from 'next/server'
import { toolRegistry } from '@/src/agent/tools'
import { buildContext } from '@/src/agent/engine'
import { evaluateToolPolicy } from '@/src/agent/policy'
import { runTool } from '@/src/agent/core/runner'
import { getOrCreateConversation } from '@/src/agent/store'
import { getSessionUserId } from '@/src/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ReqBody = {
  tool?: string
  input?: unknown
  conversationId?: string
}

export async function POST(request: Request) {
  const userId = await getSessionUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })

  const body = (await request.json().catch(() => null)) as ReqBody | null
  if (!body || typeof body.tool !== 'string') {
    return NextResponse.json({ error: 'A tool name is required.' }, { status: 400 })
  }

  const toolName = body.tool as keyof typeof toolRegistry
  const tool = toolRegistry[toolName]
  if (!tool) return NextResponse.json({ error: 'Tool unavailable.' }, { status: 404 })

  const policy = evaluateToolPolicy(toolName)
  if (!policy.allowed) return NextResponse.json({ error: policy.reason ?? 'Blocked by policy.' }, { status: 403 })

  if (policy.requiresApproval || tool.requiresApproval) {
    return NextResponse.json(
      {
        ok: true,
        tool: body.tool,
        input: body.input,
        status: 'WAITING_APPROVAL',
        message: 'This tool requires explicit user approval before execution.',
      },
      { status: 200 },
    )
  }

  const requestedId = typeof body.conversationId === 'string' && body.conversationId.length > 0 ? body.conversationId : undefined
  let conversation: { id: string }
  try {
    conversation = await getOrCreateConversation(userId, undefined, requestedId)
  } catch {
    return NextResponse.json({ error: 'Conversation does not belong to this user.' }, { status: 403 })
  }

  const ctx = buildContext(conversation.id, userId)
  const result = await runTool(toolName, body.input, ctx)

  return NextResponse.json({
    ok: result.ok,
    tool: body.tool,
    input: body.input,
    status: result.ok ? 'COMPLETED' : 'FAILED',
    deduped: result.deduped ?? false,
    data: result.ok ? result.data : undefined,
    error: result.ok ? undefined : result.error,
  })
}