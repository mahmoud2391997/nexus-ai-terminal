import { NextResponse } from 'next/server'
import { runAgentLoop, type EngineEvent } from '@/src/agent/engine'
import { getFullState } from '@/src/agent/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ReqBody = {
  conversationId?: string
  userId?: string
  message?: string
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as ReqBody | null
  if (!body || typeof body.message !== 'string' || !body.message.trim()) {
    return NextResponse.json({ error: 'A message string is required.' }, { status: 400 })
  }
  const conversationId = typeof body.conversationId === 'string' && body.conversationId.length > 0
    ? body.conversationId
    : `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const userId = typeof body.userId === 'string' && body.userId.length > 0 ? body.userId : 'user-local'

  const events: EngineEvent[] = []
  const { reply } = await runAgentLoop({
    conversationId,
    userId,
    userText: body.message,
    onEvent: (ev) => { events.push(ev) },
  })
  return NextResponse.json({
    ok: true,
    conversationId,
    reply,
    events,
    state: getFullState(conversationId),
  })
}
