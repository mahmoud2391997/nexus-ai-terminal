import { cookies } from 'next/headers'
import { auth } from '@/src/lib/auth'
import { prisma } from '@/src/lib/db'
import { isDemoMode } from '@/src/lib/demo'

const DEMO_COOKIE = 'nexus_demo'

// Demo mode: each browser gets an isolated guest user (random id in an httpOnly cookie).
// No sign-in, and data is still scoped per visitor.
export async function getDemoUserId(): Promise<string | null> {
  try {
    const jar = await cookies()
    const token = jar.get(DEMO_COOKIE)?.value
    // The cookie is created by proxy.ts before any page or API route runs.
    if (!token || !/^[a-f0-9]{32}$/.test(token)) return null
    const id = `demo_${token}`
    await prisma.user.upsert({
      where: { id },
      create: { id, email: `${id}@demo.local`, name: 'Demo user' },
      update: {},
    })
    return id
  } catch {
    return null
  }
}

// Server-side session helper: only the session cookie can produce a userId.
// Never trust a client-supplied userId in a route handler.
export async function getSessionUserId(): Promise<string | null> {
  if (isDemoMode()) return getDemoUserId()
  try {
    const session = await auth()
    return typeof session?.user?.id === 'string' && session.user.id.length > 0
      ? session.user.id
      : null
  } catch {
    return null
  }
}
