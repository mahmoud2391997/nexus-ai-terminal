import { NextResponse } from 'next/server'
import { listTasksByUser, updateTaskStatus, type TaskStatus } from '@/src/agent/store'
import { getSessionUserId } from '@/src/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const userId = await getSessionUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })

  const tasks = await listTasksByUser(userId)
  return NextResponse.json({ ok: true, tasks })
}

export async function POST(request: Request) {
  const userId = await getSessionUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })

  const body = (await request.json().catch(() => null)) as { taskId?: string; status?: TaskStatus } | null
  if (!body || typeof body.taskId !== 'string' || typeof body.status !== 'string') {
    return NextResponse.json({ error: 'taskId (string) and status are required.' }, { status: 400 })
  }

  const valid: TaskStatus[] = ['queued', 'in_progress', 'completed']
  if (!valid.includes(body.status)) {
    return NextResponse.json({ error: 'Invalid status.' }, { status: 400 })
  }

  const updated = await updateTaskStatus(userId, body.taskId, body.status)
  if (!updated) return NextResponse.json({ error: 'Task not found.' }, { status: 404 })

  return NextResponse.json({ ok: true, task: updated })
}