import { PrismaClient } from "@prisma/client"
import { env } from "./env"

// Importing env triggers boot-time validation of required environment variables.
void env

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
