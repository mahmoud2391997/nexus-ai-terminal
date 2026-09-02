import { NextResponse } from 'next/server'
import { prisma } from '@/src/lib/db'
import { env } from '@/src/lib/env'
import { getSessionUserId } from '@/src/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type IntegrationState = 'connected' | 'not_connected' | 'expired'

export async function GET() {
  const userId = await getSessionUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })

  const oauthConnections = await prisma.oAuthConnection.findMany({
    where: { userId },
  })
  const byProvider = new Map<string, { status: string }>()
  for (const connection of oauthConnections) {
    byProvider.set(connection.provider, connection)
  }

  const email: IntegrationState = byProvider.has('google') ? (byProvider.get('google')!.status as IntegrationState) : 'not_connected'

  const integrations = [
    {
      name: 'Gmail',
      state: email,
      detail: stateLabel(email),
      requires: 'Google OAuth (incremental scopes from Settings)',
    },
    {
      name: 'Calendar',
      state: email,
      detail: stateLabel(email),
      requires: 'Google OAuth',
    },
    {
      name: 'WhatsApp',
      state: env.hasWhatsApp ? 'connected' : 'not_connected',
      detail: env.hasWhatsApp ? 'Ready via Twilio' : 'Not connected',
      requires: 'PHONE_PROVIDER_API_KEY/SECRET + WHATSAPP_FROM_NUMBER',
    },
    {
      name: 'Web search',
      state: env.hasWebSearch ? 'connected' : 'not_connected',
      detail: env.hasWebSearch ? 'Live results enabled' : 'Fallback dataset',
      requires: 'SERPER_API_KEY / TAVILY_API_KEY',
    },
    {
      name: 'Phone calls',
      state: env.hasPhone ? 'connected' : 'not_connected',
      detail: env.hasPhone ? 'Ready' : 'Not connected',
      requires: 'PHONE_PROVIDER_API_KEY + SECRET',
    },
    {
      name: 'Voice',
      state: env.hasVoice ? 'connected' : 'not_connected',
      detail: env.hasVoice ? 'STT/TTS configured' : 'Browser fallback',
      requires: 'SPEECH_TO_TEXT_API_KEY + TEXT_TO_SPEECH_API_KEY',
    },
  ] as const

  return NextResponse.json({ ok: true, integrations })
}

function stateLabel(state: IntegrationState): string {
  switch (state) {
    case 'connected':
      return 'Connected'
    case 'expired':
      return 'Expired — Reconnect'
    case 'not_connected':
      return 'Not connected'
  }
}