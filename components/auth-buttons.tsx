'use client'

import { signIn, signOut } from 'next-auth/react'

export function SignInButton() {
  return (
    <button
      type="button"
      onClick={() => void signIn('google')}
      className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90"
    >
      Sign in with Google
    </button>
  )
}

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => void signOut({ callbackUrl: '/' })}
      className="rounded-md border border-border px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted"
    >
      Sign out
    </button>
  )
}