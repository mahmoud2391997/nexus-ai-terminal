# Nexus AI Terminal

A terminal-styled AI agent with permissioned, approval-gated access to Gmail, Telegram, Calendar, web search, task automation, and outbound phone calls — deployed entirely on Vercel with no standalone backend server.

> **Current status:** Phase 1–2 foundation is implemented and verified (auth, dashboard shell, streaming chat, conversation persistence, tool registry with `getCurrentTime` / `createTask` / `searchWeb`, policy engine + approval cycle, audit logging). Gmail/Calendar/Telegram/phone/automation are *scaffolded at the provider-interface level only* and are excluded from the model's tool list until real credentials are configured.

## Features

- **Terminal-style chat UI** with streaming (SSE) responses and tool-execution visualization
- **Permissioned actions** — external-effect tools require explicit user approval (approval cards)
- **Auth** — Google OAuth login, server-side session; every API route verifies the session user
- **Voice interface** — browser-native speech-to-text and text-to-speech (works with no API keys)
- **Multi-tool agent** — time queries, task creation (approval-gated), web search
- **Audit logging** — every sensitive action writes an `AuditLog` row
- **Vercel serverless** — no standalone backend process

## Tech Stack

- **Framework**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4
- **Database**: PostgreSQL with Prisma 5 (schema + offline migration included)
- **Auth**: NextAuth.js v5 with Google OAuth (database session adapter)
- **AI**: Vercel AI SDK with streaming text
- **Security**: AES-256-GCM encryption for OAuth tokens; DB-level idempotency keys

## Getting Started

### Prerequisites

- Node.js 18+ (pnpm recommended)
- PostgreSQL (local or cloud-hosted)

### 1. Install

```bash
pnpm install
```

### 2. Set Up Environment

Copy `.env.example` to `.env` and fill in the **required** variables:

```bash
cp .env.example .env
```

**Required (app will not boot without):**
- `DATABASE_URL` — PostgreSQL connection string
- `AUTH_SECRET` — generate with `openssl rand -base64 32`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google OAuth credentials

**Every other variable is optional** and enables a specific integration. Without it, that integration renders as "Not connected" and its tools are excluded from the model's tool list. See `.env.example` for inline comments.

### 3. Set Up Database

```bash
pnpm db:generate   # generate the Prisma client
pnpm db:migrate    # apply the included init migration (creates schema)
```

### 4. Run the Dev Server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000), sign in with Google, then try:

- `What time is it in Tokyo?`
- `Add task: write Q3 summary` (opens an approval card — click Approve)
- `Search Next.js release notes`
- `help`

## Scripts

```bash
pnpm dev            # start the dev server
pnpm build          # production build
pnpm start          # serve production build
pnpm db:generate    # regenerate Prisma client
pnpm db:migrate     # apply dev migrations
pnpm db:deploy      # apply migrations in production
pnpm lint           # ESLint (flat config)
pnpm typecheck      # tsc --noEmit
pnpm test           # Jest unit/integration tests
```

## Deployment to Vercel

1. Push this repo to GitHub and import it into [vercel.com](https://vercel.com).
2. Add the **required** env vars in the Vercel dashboard (`DATABASE_URL`, `AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) plus any optional ones for features you want.
3. Set up the database:
   - **Vercel Postgres (recommended)** — Vercel sets `DATABASE_URL` automatically.
   - **External PostgreSQL** — set `DATABASE_URL` yourself.
4. Apply migrations after deployment (the included `prisma/migrations` folder makes this a one-step operation):
   ```bash
   vercel env pull .env.local
   pnpm db:deploy
   ```
5. Configure Google OAuth redirect URIs to include `https://your-domain.vercel.app/api/auth/callback/google`.

The build runs `tsc` (type errors are **not** ignored) and `prisma generate`; `pnpm build` and `pnpm lint` must be clean before deploy.

## Project Structure

```text
src/
├── agent/
│   ├── core/
│   │   ├── execution.ts   # ToolExecution state machine + idempotency keys
│   │   └── runner.ts      # runTool: zod → execution → audit → result
│   ├── engine.ts          # agent loop (streaming events, approval cycle)
│   ├── policy.ts          # policy engine (SOLE authority on approvals)
│   ├── store.ts           # re-exports of lib/store
│   ├── tools.ts           # getCurrentTime, createTask, searchWeb
│   └── types.ts
├── app/
│   ├── page.tsx           # sign-in gate + terminal
│   └── api/
│       ├── auth/[...nextauth]/route.ts
│       ├── chat/route.ts  # streaming SSE, agent loop
│       ├── approve/route.ts
│       ├── agent/route.ts
│       ├── state/route.ts
│       ├── tasks/route.ts
│       └── integrations/route.ts
├── components/
│   ├── auth-buttons.tsx
│   ├── nexus-terminal.tsx
│   └── ui/
├── lib/
│   ├── ai.ts              # AI SDK model provider (streaming)
│   ├── auth.ts            # NextAuth config
│   ├── db.ts              # Prisma client
│   ├── encryption.ts      # AES-256-GCM token crypto
│   ├── env.ts             # env validation + feature flags
│   ├── session.ts         # server-side session userId helper
│   └── store.ts           # DB access layer (conversations, tasks, approvals)
└── __tests__/             # unit, policy, adversarial, encryption, execution
```

## Architecture Summary

```
User → Auth → Conversation API → Agent
  → Model proposes a tool call
  → Policy Engine evaluates risk (SAFE / CONFIRMATION_REQUIRED / HIGH_RISK)
  → Zod validation of tool input
  → Approval gate (if required)
  → Tool execution (server-side credentials only, idempotency-checked)
  → Result returned to agent → streamed response
```

- Every mutating API route derives `userId` from the **session**, never from the client.
- Every tool validates input with Zod and re-verifies resource ownership before acting.
- The **policy engine** — not the model — decides whether an action needs approval.
- External-effect tools are idempotent: retried calls short-circuit to the stored result.

## Available Tools

- **getCurrentTime** — current time in any timezone (SAFE, auto-runs)
- **searchWeb** — web search (SAFE, auto-runs; returns labeled fallback without a search key)
- **createTask** — create a task (CONFIRMATION_REQUIRED; requires approval)

Additional tools (Gmail, Calendar, Telegram, Phone, automations) are **not** stubbed or falsely enabled — their providers are only made available as interfaces once the corresponding credentials exist in the environment.

## Security

- OAuth tokens and API keys live only server-side; never sent to the model, the prompt, or the client.
- Tokens encrypted at rest (AES-256-GCM, keyed by `TOKEN_ENCRYPTION_KEY`).
- Every sensitive action is audited.
- User-scoped queries; cross-user access is rejected at the ORM/route layer.
- Idempotency keys prevent duplicate external effects on retried requests.

## License

MIT
