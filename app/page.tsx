import { auth } from '@/src/lib/auth'
import { NexusTerminal } from '@/components/nexus-terminal'
import { SignInButton } from '@/components/auth-buttons'

export default async function Page() {
  const session = await auth()
  const user = {
    id: typeof session?.user?.id === 'string' ? session.user.id : null,
    name: session?.user?.name ?? null,
    email: session?.user?.email ?? null,
    image: typeof session?.user?.image === 'string' ? session.user.image : null,
  }

  if (!user.id) {
    return <SignInScreen />
  }

  return <NexusTerminal user={user} />
}

function SignInScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto flex size-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <span className="font-mono text-lg font-bold">N</span>
        </div>
        <div className="mt-4 font-mono text-lg font-semibold tracking-[0.2em]">NEXUS</div>
        <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          AI terminal
        </p>
        <p className="mt-6 text-sm text-muted-foreground">
          Sign in with Google to continue. Your conversations, tasks, and approvals are stored securely
          and scoped to your account.
        </p>
        <div className="mt-6">
          <SignInButton />
        </div>
      </div>
    </main>
  )
}

export { SignInScreen }