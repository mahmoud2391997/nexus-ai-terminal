import { getGoogleAccessToken, GoogleApiError } from './google'

export type CreateCalendarEventParams = {
  title: string
  startDateTime: string
  timeZone?: string
  endDateTime?: string
  durationMinutes?: number
  description?: string
}

export class CalendarError extends GoogleApiError {}

// Given a wall-clock instant in an IANA timezone, produces an RFC3339 string with the correct UTC offset.
function toRfc3339(dateTime: string, timeZone: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(dateTime.trim())
  if (!m) throw new CalendarError('INVALID_DATETIME', `Could not parse the start date/time: ${dateTime}. Use ISO format like 2026-08-30T15:00:00.`)
  const [, y, mo, d, h, mi, sRaw] = m
  const ss = Number(sRaw ?? '00')

  const offsetAt = (ts: number): number => {
    const wall = wallParts(new Date(ts), timeZone)
    return Date.UTC(wall.y, wall.mo, wall.d, wall.h, wall.mi, wall.s) - ts
  }

  // Treat the civil time as UTC as an initial guess, then correct by the timezone offset.
  const guess = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), ss)
  const offset = offsetAt(guess)
  const instant = guess - offset

  const wall = wallParts(new Date(instant), timeZone)
  const finalOffset = Date.UTC(wall.y, wall.mo, wall.d, wall.h, wall.mi, wall.s) - instant
  const abs = Math.abs(finalOffset)
  const sign = finalOffset >= 0 ? '+' : '-'
  const oh = String(Math.floor(abs / 3600000)).padStart(2, '0')
  const om = String(Math.floor((abs % 3600000) / 60000)).padStart(2, '0')

  return `${wall.y}-${pad2(wall.mo + 1)}-${pad2(wall.d)}T${pad2(wall.h)}:${pad2(wall.mi)}:${pad2(wall.s)}${sign}${oh}:${om}`
}

type Parts = { y: number; mo: number; d: number; h: number; mi: number; s: number }
function wallParts(date: Date, timeZone: string): Parts {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone,
  })
  const p: Record<string, string> = {}
  for (const part of fmt.formatToParts(date)) p[part.type] = part.value
  return {
    y: Number(p.year),
    mo: Number(p.month) - 1,
    d: Number(p.day),
    h: p.hour === '24' ? 0 : Number(p.hour),
    mi: Number(p.minute),
    s: Number(p.second),
  }
}
function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

// Creates an event on the user's primary Google Calendar.
export async function createGoogleCalendarEvent(
  userId: string,
  params: CreateCalendarEventParams,
): Promise<{ id: string; htmlLink: string }> {
  const accessToken = await getGoogleAccessToken(userId)

  const timeZone = params.timeZone || 'UTC'
  const startDateTime = toRfc3339(params.startDateTime, timeZone)

  let endDateTime: string
  if (params.endDateTime) {
    endDateTime = toRfc3339(params.endDateTime, timeZone)
  } else {
    const durationMs = (params.durationMinutes ?? 60) * 60_000
    const end = new Date(startDateTime).getTime() + durationMs
    endDateTime = new Date(end).toISOString()
  }

  const body = {
    summary: params.title,
    description: params.description || undefined,
    start: { dateTime: startDateTime, timeZone },
    end: { dateTime: endDateTime, timeZone },
  }

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=none`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  )

  const data = (await res.json().catch(() => ({}))) as {
    id?: string
    htmlLink?: string
    error?: { message?: string }
  }
  if (!res.ok || !data.id) {
    const msg = data.error?.message || `Google Calendar rejected the request (${res.status}).`
    throw new CalendarError('CALENDAR_CREATE_FAILED', msg)
  }

  return { id: data.id, htmlLink: data.htmlLink || `https://calendar.google.com/calendar/event?eid=${data.id}` }
}
