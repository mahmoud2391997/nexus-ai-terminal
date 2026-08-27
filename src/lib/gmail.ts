import { getGoogleAccessToken, GoogleApiError } from './google'

export type SendEmailParams = { to: string; subject: string; body: string }

// GmailError kept as an alias for backwards compatibility with callers.
export class GmailError extends GoogleApiError {}

function buildMessage(to: string, subject: string, body: string): string {
  const headers = [
    `To: ${to}`,
    'Content-Type: text/plain; charset=UTF-8',
    'MIME-Version: 1.0',
    `Subject: ${subject}`,
    '',
    body,
  ].join('\r\n')
  return Buffer.from(headers, 'utf8').toString('base64url')
}

// Sends an email through the Gmail API using the user's stored OAuth connection.
export async function sendGmailEmail(userId: string, params: SendEmailParams): Promise<{ messageId: string }> {
  const accessToken = await getGoogleAccessToken(userId)
  const raw = buildMessage(params.to, params.subject, params.body)

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  })

  const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string; error?: { message?: string } }
  if (!res.ok || !data.id) {
    const msg = data.error?.message || data.message || `Gmail API rejected the request (${res.status}).`
    throw new GmailError('GMAIL_SEND_FAILED', msg)
  }

  return { messageId: data.id }
}
