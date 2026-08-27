import { auth } from '@/src/lib/auth'

// Server-side session helper: only the session cookie can produce a userId.
// Never trust a client-supplied userId in a route handler.
export async function getSessionUserId(): Promise<string | null> {
  try {
    const session = await auth()
    return typeof session?.user?.id === 'string' && session.user.id.length > 0
      ? session.user.id
      : null
  } catch {
    return null
  }
}