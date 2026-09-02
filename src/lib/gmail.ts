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

export type SearchEmailsParams = { query: string; maxResults?: number }

export type EmailMessage = {
  id: string
  threadId: string
  from?: string
  subject?: string
  date?: string
  snippet?: string
}

// Searches the user's Gmail mailbox via the Gmail API (messages.list + metadata fetch).
export async function searchGmailEmails(
  userId: string,
  params: SearchEmailsParams,
): Promise<{ results: EmailMessage[]; totalResults: number }> {
  const accessToken = await getGoogleAccessToken(userId)
  const maxResults = Math.min(Math.max(params.maxResults ?? 10, 1), 25)

  const listUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages')
  listUrl.searchParams.set('q', params.query)
  listUrl.searchParams.set('maxResults', String(maxResults))

  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const listData = (await listRes.json().catch(() => ({}))) as {
    messages?: Array<{ id: string; threadId: string }>
    resultSizeEstimate?: number
    error?: { message?: string }
  }

  if (!listRes.ok) {
    const msg = listData.error?.message || `Gmail API rejected the search (${listRes.status}).`
    throw new GmailError('GMAIL_SEARCH_FAILED', msg)
  }

  const totalResults = listData.resultSizeEstimate ?? 0
  const items = listData.messages ?? []
  const results: EmailMessage[] = []

  for (const item of items) {
    const metaRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    const meta = (await metaRes.json().catch(() => ({}))) as {
      id?: string
      threadId?: string
      snippet?: string
      payload?: { headers?: Array<{ name: string; value: string }> }
      error?: { message?: string }
    }
    if (!metaRes.ok || !meta.id) continue

    const header = (name: string) =>
      meta.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value

    results.push({
      id: meta.id,
      threadId: meta.threadId ?? item.threadId,
      from: header('from'),
      subject: header('subject'),
      date: header('date'),
      snippet: meta.snippet,
    })
  }

  return { results, totalResults }
}
