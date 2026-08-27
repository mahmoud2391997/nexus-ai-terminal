import { NextResponse } from 'next/server'
import { resolveApproval, type EngineEvent } from '@/src/agent/engine'
import { canAccessConversation, getFullState } from '@/src/agent/store'
import { getSessionUserId } from '@/src/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ReqBody = {
  conversationId: string
  approvalId: string
  status: 'APPROVED' | 'REJECTED'
}

export async function POST(request: Request) {
  const userId = await getSessionUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })

  const body = (await request.json().catch(() => null)) as ReqBody | null
  if (
    !body ||
    typeof body.conversationId !== 'string' ||
    typeof body.approvalId !== 'string' ||
    (body.status !== 'APPROVED' && body.status !== 'REJECTED')
  ) {
    return NextResponse.json(
      { error: 'conversationId, approvalId (strings) and status ("APPROVED" | "REJECTED") are required.' },
      { status: 400 },
    )
  }

  const allowed = await canAccessConversation(userId, body.conversationId)
  if (!allowed) return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 })

  const events: EngineEvent[] = []
  const result = await resolveApproval(
    {
      conversationId: body.conversationId,
      approvalId: body.approvalId,
      status: body.status,
      userId,
    },
    (ev) => {
      events.push(ev)
    },
  )
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 404 })
  }

  return NextResponse.json({
    ok: true,
    status: result.status,
    reply: result.reply,
    events,
    state: await getFullState(body.conversationId),
  })
}