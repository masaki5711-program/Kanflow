import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@/generated/prisma/client"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function getRequiredEnv(key: string, defaultForDev?: string): string {
  const value = process.env[key]
  if (value) return value
  if (process.env.NODE_ENV !== "production" && defaultForDev) return defaultForDev
  throw new Error(`Required environment variable ${key} is not set`)
}

/** Connection attempt bound: an unreachable database fails a request instead of hanging it. */
export const DB_CONNECT_TIMEOUT_MS = 10_000
/** Idle pooled connections are closed after this long. */
export const DB_IDLE_TIMEOUT_MS = 60_000

function createPrismaClient() {
  // PostgreSQL 16 (node-postgres pool via the Prisma driver adapter). Same
  // discrete DATABASE_* variables as before the MySQL -> PostgreSQL move;
  // prisma.config.ts (CLI) reads DATABASE_URL.
  const adapter = new PrismaPg({
    host: getRequiredEnv("DATABASE_HOST", "localhost"),
    port: Number(getRequiredEnv("DATABASE_PORT", "5432")),
    user: getRequiredEnv("DATABASE_USER", "postgres"),
    password: getRequiredEnv("DATABASE_PASSWORD"),
    database: getRequiredEnv("DATABASE_NAME", "scrum_tool"),
    max: 5,
    connectionTimeoutMillis: DB_CONNECT_TIMEOUT_MS,
    idleTimeoutMillis: DB_IDLE_TIMEOUT_MS,
    application_name: "kanflow",
  })
  return new PrismaClient({ adapter })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
