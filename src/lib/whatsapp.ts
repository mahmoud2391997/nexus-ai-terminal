export type SendWhatsAppParams = { to: string; body: string }

export class WhatsAppError extends Error {
  constructor(
    public code: 'NOT_CONFIGURED' | 'TWILIO_SEND_FAILED',
    message: string,
  ) {
    super(message)
    this.name = 'WhatsAppError'
  }
}

function accountSid(): string {
  return process.env.PHONE_PROVIDER_API_KEY ?? ''
}

function authToken(): string {
  return process.env.PHONE_PROVIDER_API_SECRET ?? ''
}

function fromNumber(): string {
  return process.env.WHATSAPP_FROM_NUMBER ?? ''
}

// Strips extraneous characters so values like "+1 (234) 567-8900" or "whatsapp:+1415"
// become the canonical "whatsapp:+14155550100" format expected by the Twilio API.
function toWhatsAppAddress(value: string): string {
  const digits = value.replace(/[^+\d]/g, '')
  const hasPlus = value.includes('+')
  const canonical = hasPlus && !digits.startsWith('+') ? `+${digits}` : digits
  return `whatsapp:${canonical}`
}

// Sends a WhatsApp message through Twilio's Messages API (WhatsApp Business API).
// Reuses PHONE_PROVIDER_API_KEY/SECRET as the Twilio Account SID / Auth Token and
// requires WHATSAPP_FROM_NUMBER to be a WhatsApp-enabled Twilio number.
export async function sendTwilioWhatsAppMessage(
  _userId: string,
  params: SendWhatsAppParams,
): Promise<{ sid: string }> {
  const sid = accountSid()
  const token = authToken()
  if (!sid || !token) {
    throw new WhatsAppError(
      'NOT_CONFIGURED',
      'WhatsApp is not configured. Set PHONE_PROVIDER_API_KEY (Twilio Account SID) and PHONE_PROVIDER_API_SECRET (Twilio Auth Token).',
    )
  }

  const from = fromNumber()
  if (!from) {
    throw new WhatsAppError(
      'NOT_CONFIGURED',
      'WhatsApp is not configured. Set WHATSAPP_FROM_NUMBER to your WhatsApp-enabled Twilio number (e.g. +14155550100).',
    )
  }

  const body = new URLSearchParams({
    To: toWhatsAppAddress(params.to),
    From: toWhatsAppAddress(from),
    Body: params.body,
  })

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  const data = (await res.json().catch(() => ({}))) as {
    sid?: string
    message?: string
    error_message?: string
  }

  if (!res.ok || !data.sid) {
    const msg = data.error_message || data.message || `Twilio rejected the request (${res.status}).`
    throw new WhatsAppError('TWILIO_SEND_FAILED', msg)
  }

  return { sid: data.sid }
}
