import { NextResponse } from 'next/server'
import { listActivityByUser } from '@/src/agent/store'
import { getSessionUserId } from '@/src/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const userId = await getSessionUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })

  const activity = await listActivityByUser(userId)
  return NextResponse.json({ ok: true, activity })
}
