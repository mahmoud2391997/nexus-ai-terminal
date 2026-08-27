import { runAgentStream, type EngineEvent } from '@/src/agent/engine'
import { getOrCreateConversation } from '@/src/agent/store'
import { getSessionUserId } from '@/src/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ReqBody = {
  message?: string
  conversationId?: string
}

export async function POST(request: Request) {
  const userId = await getSessionUserId()
  if (!userId) return new Response('Unauthorized.', { status: 401 })

  const body = (await request.json().catch(() => null)) as ReqBody | null
  const message = typeof body?.message === 'string' ? body.message.trim() : ''
  if (!message) return new Response('A message string is required.', { status: 400 })

  const requestedId = typeof body?.conversationId === 'string' && body.conversationId.length > 0 ? body.conversationId : undefined

  let conversationId: string
  try {
    const conversation = await getOrCreateConversation(userId, message.slice(0, 80), requestedId)
    conversationId = conversation.id
  } catch {
    return new Response('Conversation does not belong to this user.', { status: 403 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (ev: EngineEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`))
      }
      try {
        await runAgentStream({
          conversationId,
          userId,
          userText: message,
          onEvent: send,
        })
      } catch (err) {
        send({
          type: 'error',
          message: err instanceof Error ? err.message : 'Unexpected agent error.',
        })
      } finally {
        try {
          controller.close()
        } catch {
          // stream already closed
        }
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'x-conversation-id': conversationId,
    },
  })
}