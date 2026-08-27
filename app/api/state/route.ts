import { NextResponse } from 'next/server'
import { getFullState } from '@/src/agent/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const conversationId = searchParams.get('conversationId') ?? `conv_default`
  return NextResponse.json({ ok: true, conversationId, state: getFullState(conversationId) })
}
