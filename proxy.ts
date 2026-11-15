import { NextResponse, type NextRequest } from 'next/server'

// Demo mode: make sure every visitor has a guest cookie BEFORE the page/API runs
// (server components cannot set cookies). The cookie is also injected into the
// current request so the first render already sees it.
export function proxy(request: NextRequest) {
  const demo = process.env.DEMO_MODE === 'true' || process.env.DEMO_MODE === '1'
  if (!demo) return NextResponse.next()

  const existing = request.cookies.get('nexus_demo')?.value
  if (existing && /^[a-f0-9]{32}$/.test(existing)) return NextResponse.next()

  const bytes = crypto.getRandomValues(new Uint8Array(16))
  const token = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')

  request.cookies.set('nexus_demo', token)
  const response = NextResponse.next({ request: { headers: new Headers(request.headers) } })
  response.cookies.set('nexus_demo', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico)$).*)'],
}
