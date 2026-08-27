import { NextResponse } from 'next/server'
import { resolveApproval, type EngineEvent } from '@/src/agent/engine'
import { getFullState } from '@/src/agent/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ReqBody = {
  conversationId: string
  approvalId: string
  status: 'APPROVED' | 'REJECTED'
}

export async function POST(request: Request) {
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
  const events: EngineEvent[] = []
  const result = await resolveApproval(
    { conversationId: body.conversationId, approvalId: body.approvalId, status: body.status },
    (ev) => { events.push(ev) },
  )
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 404 })
  }
  return NextResponse.json({
    ok: true,
    status: result.status,
    reply: result.reply,
    events,
    state: getFullState(body.conversationId),
  })
}
