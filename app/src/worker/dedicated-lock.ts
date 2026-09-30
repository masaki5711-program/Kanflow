import { lockResultIsOne, type NamedLockHandle } from "./named-lock"

/**
 * MySQL named lock held on a DEDICATED connection (not a pooled Prisma one).
 *
 * The single-instance lock lives as long as the worker. Holding it inside a
 * Prisma interactive transaction pinned one of the app's 5 pooled
 * connections for the whole lifetime, kept a transaction open for weeks and
 * forced a reconnect when the transaction timeout (~23 days, 2e9 ms) fired.
 * A separate `mariadb` connection has none of that: no transaction, no pool
 * slot, no timeout. The heartbeat's `verify()` query (every 60 s) keeps the
 * session well inside MySQL's `wait_timeout` (8 h); if the connection drops
 * anyway, `verify()` returns false and the worker restarts cleanly.
 */

export interface LockConnection {
  query(sql: string, values?: unknown[]): Promise<unknown>
  end(): Promise<void>
  destroy?(): void
}

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
        port: u.port ? Number(u.port) : 3306,
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
  const port = Number(env.DATABASE_PORT?.trim() || fromUrl.port || 3306)
  if (!host || !user || !database || !Number.isInteger(port) || port <= 0) return null
  return { host: host === "localhost" ? "127.0.0.1" : host, port, user, password, database }
}

/** Factory for the dedicated lock connection (real `mariadb` driver, loaded lazily). */
export function createLockConnect(env: NodeJS.ProcessEnv): LockConnect {
  return async () => {
    const cfg = resolveLockDbConfig(env)
    if (!cfg) throw new Error("lock connection: DATABASE_HOST/USER/NAME (or DATABASE_URL) not configured")
    const mariadb = await import("mariadb")
    return mariadb.createConnection({
      ...cfg,
      connectTimeout: 10_000,
      // TCP keep-alive so a half-open socket is noticed; verify() does the rest.
      keepAliveDelay: 30_000,
      // Same reason as src/lib/prisma.ts (caching_sha2_password over loopback).
      allowPublicKeyRetrieval: true,
    })
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
 * Open a dedicated connection and try `GET_LOCK(name, 0)`.
 * Resolves with a handle when acquired, null when another session holds it
 * (the connection is closed again). Rejects only when the database is unreachable.
 */
export async function acquireDedicatedLock(connect: LockConnect, name: string): Promise<NamedLockHandle | null> {
  const conn = await connect()
  let got: boolean
  try {
    got = lockResultIsOne(await conn.query("SELECT GET_LOCK(?, 0) AS v", [name]))
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
        return lockResultIsOne(await conn.query("SELECT IS_USED_LOCK(?) = CONNECTION_ID() AS v", [name]))
      } catch {
        return false
      }
    },
    release: () => {
      released ??= (async () => {
        try {
          await conn.query("SELECT RELEASE_LOCK(?) AS v", [name])
        } catch {
          // Session already gone: the server released the lock with it.
        }
        await closeQuietly(conn)
      })()
      return released
    },
  }
}
