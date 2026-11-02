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

/** A positive integer from the environment, else `fallback`. Throws on garbage (no silent default). */
function positiveIntEnv(key: string, fallback: number): number {
  const raw = process.env[key]?.trim()
  if (!raw) return fallback
  const n = Number(raw)
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${key} must be a positive integer (got "${raw}")`)
  return n
}

function portFrom(raw: string): number {
  const n = Number(raw.trim())
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error(`DATABASE_PORT must be an integer between 1 and 65535 (got "${raw}")`)
  return n
}

/** Connection attempt bound: an unreachable database fails a request instead of hanging it. */
export const DB_CONNECT_TIMEOUT_MS = 10_000
/** Idle pooled connections are closed after this long. */
export const DB_IDLE_TIMEOUT_MS = 60_000
/**
 * Pool size. The global search runs 6 queries at once (5 entity types + the
 * translation lookup) after the project lookup; 10 leaves room for the other
 * requests and the in-process jobs. PostgreSQL's default max_connections is 100.
 */
export const DB_POOL_MAX = 10
/** Server-side bound per statement (DATABASE_STATEMENT_TIMEOUT_MS): a runaway query is cancelled, not left running. */
export const DB_STATEMENT_TIMEOUT_MS = 30_000
/** Bound on waiting for a row / table lock (DATABASE_LOCK_TIMEOUT_MS), e.g. the PBI row lock of work claims. */
export const DB_LOCK_TIMEOUT_MS = 10_000

function createPrismaClient() {
  // PostgreSQL 16 (node-postgres pool via the Prisma driver adapter). Same
  // discrete DATABASE_* variables as before the MySQL -> PostgreSQL move;
  // prisma.config.ts (CLI) reads DATABASE_URL.
  const adapter = new PrismaPg({
    host: getRequiredEnv("DATABASE_HOST", "localhost"),
    port: portFrom(getRequiredEnv("DATABASE_PORT", "5432")),
    user: getRequiredEnv("DATABASE_USER", "postgres"),
    password: getRequiredEnv("DATABASE_PASSWORD"),
    database: getRequiredEnv("DATABASE_NAME", "scrum_tool"),
    max: positiveIntEnv("DATABASE_POOL_MAX", DB_POOL_MAX),
    connectionTimeoutMillis: DB_CONNECT_TIMEOUT_MS,
    idleTimeoutMillis: DB_IDLE_TIMEOUT_MS,
    statement_timeout: positiveIntEnv("DATABASE_STATEMENT_TIMEOUT_MS", DB_STATEMENT_TIMEOUT_MS),
    lock_timeout: positiveIntEnv("DATABASE_LOCK_TIMEOUT_MS", DB_LOCK_TIMEOUT_MS),
    // Sessions run in UTC whatever the server / database default is: columns are
    // TIMESTAMP(3) holding UTC, and DEFAULT CURRENT_TIMESTAMP follows the session zone.
    options: "-c TimeZone=UTC",
    application_name: "kanflow",
  })
  return new PrismaClient({ adapter })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
