import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "./db"
import { encrypt } from "./encryption"
import type { Adapter } from "next-auth/adapters"

const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ")

type GoogleAccount = {
  provider: string
  access_token?: string | null
  refresh_token?: string | null
  expires_at?: number | null
  scope?: string | null
}

async function syncGoogleConnection(userId: string, account: GoogleAccount): Promise<void> {
  const scopes = (account.scope || "").split(/\s+/).filter(Boolean)
  await prisma.oAuthConnection.upsert({
    where: { userId_provider: { userId, provider: "google" } },
    create: {
      userId,
      provider: "google",
      accessTokenEncrypted: encrypt(account.access_token || ""),
      refreshTokenEncrypted: account.refresh_token ? encrypt(account.refresh_token) : null,
      expiresAt: account.expires_at ? new Date(account.expires_at * 1000) : null,
      scopes,
      status: account.refresh_token ? "connected" : "expired",
    },
    update: {
      accessTokenEncrypted: account.access_token ? encrypt(account.access_token) : undefined,
      refreshTokenEncrypted: account.refresh_token
        ? encrypt(account.refresh_token)
        : undefined,
      expiresAt: account.expires_at ? new Date(account.expires_at * 1000) : undefined,
      scopes,
      updatedAt: new Date(),
    },
  })
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma) as Adapter,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          scope: GOOGLE_SCOPES,
        },
      },
    }),
  ],
  events: {
    async linkAccount({ user, account }) {
      if (!user?.id || !account || account.provider !== "google") return
      await syncGoogleConnection(user.id, account)
    },
  },
  callbacks: {
    signIn({ user, account }) {
      if (account?.provider === "google" && user?.id) {
        // Runs on EVERY Google sign-in (new + re-auth), so scopes/tokens stay current
        // even when the account was already linked (linkAccount only fires for new links).
        void syncGoogleConnection(user.id, account).catch(() => {})
      }
      return true
    },
    session({ session, user }) {
      if (session.user && "id" in user && typeof user.id === "string") {
        session.user.id = user.id
      }
      return session
    },
  },
  pages: {
    signIn: "/",
  },
  session: {
    strategy: "database",
  },
  trustHost: true,
})
