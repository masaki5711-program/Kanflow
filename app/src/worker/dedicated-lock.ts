import { lockResultIsOne, type NamedLockHandle } from "./named-lock"

/**
 * Session-level PostgreSQL advisory lock held on a DEDICATED connection (not
 * a pooled Prisma one) - the replacement of MySQL's GET_LOCK.
 *
 * The single-instance lock lives as long as the worker. Holding it inside a
 * Prisma interactive transaction pinned one of the app's 5 pooled
 * connections for the whole lifetime, kept a transaction open for weeks and
 * forced a reconnect when the transaction timeout (~23 days, 2e9 ms) fired.
 * A separate `pg` connection has none of that: no transaction, no pool slot,
 * no timeout. The lock belongs to the session: it is released by
 * `pg_advisory_unlock` or, whatever happens, when the connection ends. The
 * heartbeat's `verify()` query (every 60 s) keeps the session busy; if the
 * connection drops anyway, `verify()` returns false and the worker restarts
 * cleanly.
 *
 * Key: `hashtextextended(name, 0)` - the same key space as ./named-lock.
 */

/** Minimal connection: `query` resolves with the result ROWS. */
export interface LockConnection {
  query(sql: string, values?: unknown[]): Promise<unknown>
  end(): Promise<void>
  destroy?(): void
}

export const TRY_LOCK_SQL = "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS v"
export const OWNS_LOCK_SQL =
  "SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND granted AND pid = pg_backend_pid() AND objsubid = 1" +
  " AND classid = ((hashtextextended($1, 0) >> 32) & 4294967295)::oid AND objid = (hashtextextended($1, 0) & 4294967295)::oid) AS v"
export const UNLOCK_SQL = "SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS v"

/** Connect / per-statement bound: a hung server never blocks the worker's start-up forever. */
const CONNECT_TIMEOUT_MS = 10_000
const STATEMENT_TIMEOUT_MS = 15_000

export type LockConnect = () => Promise<LockConnection>

export interface LockDbConfig {
  host: string
  port: number
  user: string
  password: string
  database: string
}

/**
 * Connection settings: the discrete DATABASE_* variables the app itself uses
 * (src/lib/prisma.ts), falling back to DATABASE_URL. Returns null when
 * neither is usable. Never logs or returns the password in errors.
 */
export function resolveLockDbConfig(env: NodeJS.ProcessEnv): LockDbConfig | null {
  let fromUrl: Partial<LockDbConfig> = {}
  const url = env.DATABASE_URL?.trim()
  if (url) {
    try {
      const u = new URL(url)
      fromUrl = {
        host: u.hostname,
        port: u.port ? Number(u.port) : 5432,
        user: decodeURIComponent(u.username),
        password: decodeURIComponent(u.password),
        database: u.pathname.replace(/^\//, "").split("?")[0],
      }
    } catch {
      fromUrl = {}
    }
  }
  const host = env.DATABASE_HOST?.trim() || fromUrl.host || ""
  const user = env.DATABASE_USER?.trim() || fromUrl.user || ""
  const password = env.DATABASE_PASSWORD ?? fromUrl.password ?? ""
  const database = env.DATABASE_NAME?.trim() || fromUrl.database || ""
  const port = Number(env.DATABASE_PORT?.trim() || fromUrl.port || 5432)
  if (!host || !user || !database || !Number.isInteger(port) || port <= 0) return null
  return { host: host === "localhost" ? "127.0.0.1" : host, port, user, password, database }
}

/** Factory for the dedicated lock connection (real `pg` driver, loaded lazily). */
export function createLockConnect(env: NodeJS.ProcessEnv): LockConnect {
  return async () => {
    const cfg = resolveLockDbConfig(env)
    if (!cfg) throw new Error("lock connection: DATABASE_HOST/USER/NAME (or DATABASE_URL) not configured")
    const { default: pg } = await import("pg")
    const client = new pg.Client({
      ...cfg,
      connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
      statement_timeout: STATEMENT_TIMEOUT_MS,
      // TCP keep-alive so a half-open socket is noticed; verify() does the rest.
      keepAlive: true,
      keepAliveInitialDelayMillis: 30_000,
      application_name: "kanflow-worker-lock",
    })
    // A dropped connection emits "error"; unhandled it would crash the process.
    // verify() then fails and the worker restarts cleanly.
    client.on("error", () => undefined)
    await client.connect()
    return {
      query: async (sql, values) => (await client.query(sql, values)).rows,
      end: () => client.end(),
    }
  }
}

async function closeQuietly(conn: LockConnection): Promise<void> {
  try {
    await conn.end()
  } catch {
    conn.destroy?.()
  }
}

/**
 * Open a dedicated connection and try `pg_try_advisory_lock` (no waiting).
 * Resolves with a handle when acquired, null when another session holds it
 * (the connection is closed again). Rejects only when the database is unreachable.
 */
export async function acquireDedicatedLock(connect: LockConnect, name: string): Promise<NamedLockHandle | null> {
  const conn = await connect()
  let got: boolean
  try {
    got = lockResultIsOne(await conn.query(TRY_LOCK_SQL, [name]))
  } catch (err) {
    await closeQuietly(conn)
    throw err
  }
  if (!got) {
    await closeQuietly(conn)
    return null
  }
  let released: Promise<void> | null = null
  return {
    name,
    verify: async () => {
      if (released) return false
      try {
        return lockResultIsOne(await conn.query(OWNS_LOCK_SQL, [name]))
      } catch {
        return false
      }
    },
    release: () => {
      released ??= (async () => {
        try {
          await conn.query(UNLOCK_SQL, [name])
        } catch {
          // Session already gone: the server released the lock with it.
        }
        await closeQuietly(conn)
      })()
      return released
    },
  }
}
