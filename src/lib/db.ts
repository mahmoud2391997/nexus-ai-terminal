import { PrismaClient } from "@prisma/client"
import { env } from "./env"
import { createMemoryPrisma } from "./memory-db"

// Importing env triggers boot-time validation of required environment variables.
void env

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// No DATABASE_URL -> fall back to an in-memory store (demo only; resets on restart).
export const usingMemoryDb = !process.env.DATABASE_URL

if (usingMemoryDb && process.env.NODE_ENV !== "test") {
  console.warn("DATABASE_URL not set: using in-memory demo storage (data is not persisted).")
}

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  (usingMemoryDb ? (createMemoryPrisma() as unknown as PrismaClient) : new PrismaClient())

if (process.env.NODE_ENV !== "production" || usingMemoryDb) globalForPrisma.prisma = prisma
