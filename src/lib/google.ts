import { prisma } from './db'
import { decrypt, encrypt } from './encryption'

export class GoogleApiError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
    this.name = 'GoogleApiError'
  }
}

async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: Date }> {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new GoogleApiError('GOOGLE_NOT_CONFIGURED', 'Google OAuth client credentials are not configured.')
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  const data = (await res.json()) as { access_token?: string; expires_in?: number; error?: string }
  if (!res.ok || !data.access_token) {
    throw new GoogleApiError('GOOGLE_REFRESH_FAILED', data.error || `Failed to refresh Google token (${res.status}).`)
  }

  const expiresAt = new Date(Date.now() + (data.expires_in ?? 3600) * 1000 - 60_000)
  return { accessToken: data.access_token, expiresAt }
}

// Returns a valid access token for the user's Google connection, refreshing if needed.
export async function getGoogleAccessToken(userId: string): Promise<string> {
  const conn = await prisma.oAuthConnection.findUnique({
    where: { userId_provider: { userId, provider: 'google' } },
  })
  if (!conn) {
    throw new GoogleApiError('GOOGLE_NOT_CONNECTED', 'Google is not connected. Sign in with Google to connect it.')
  }

  const now = Date.now()
  const notExpired = conn.expiresAt && conn.expiresAt.getTime() > now
  const accessToken = conn.accessTokenEncrypted ? decrypt(conn.accessTokenEncrypted) : ''
  const refreshToken = conn.refreshTokenEncrypted ? decrypt(conn.refreshTokenEncrypted) : ''

  if (notExpired && accessToken) return accessToken
  if (!refreshToken) {
    throw new GoogleApiError('GOOGLE_TOKEN_EXPIRED', 'Your Google connection has expired and cannot be refreshed. Reconnect via Google sign-in.')
  }

  const refreshed = await refreshAccessToken(refreshToken)
  await prisma.oAuthConnection.update({
    where: { userId_provider: { userId, provider: 'google' } },
    data: {
      accessTokenEncrypted: encrypt(refreshed.accessToken),
      expiresAt: refreshed.expiresAt,
      updatedAt: new Date(),
    },
  })
  return refreshed.accessToken
}

// Ensures the user's connection actually grants the given scope.
export async function assertGoogleScope(userId: string, scope: string): Promise<void> {
  const conn = await prisma.oAuthConnection.findUnique({
    where: { userId_provider: { userId, provider: 'google' } },
  })
  const scopes = conn?.scopes ?? []
  if (!scopes.includes(scope)) {
    throw new GoogleApiError(
      'GOOGLE_SCOPE_MISSING',
      `Your Google connection is missing the required scope (${scope}). Reconnect via Google sign-in and grant the requested permissions.`,
    )
  }
}
