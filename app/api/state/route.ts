import { NextResponse } from 'next/server'
import { canAccessConversation, getFullState } from '@/src/agent/store'
import { getSessionUserId } from '@/src/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const userId = await getSessionUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const conversationId = searchParams.get('conversationId') ?? ''
  if (!conversationId) {
    const { listConversations } = await import('@/src/agent/store')
    const conversations = await listConversations(userId)
    return NextResponse.json({ ok: true, conversations })
  }

  const allowed = await canAccessConversation(userId, conversationId)
  if (!allowed) return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 })

  const state = await getFullState(conversationId)
  return NextResponse.json({ ok: true, conversationId, state })
}