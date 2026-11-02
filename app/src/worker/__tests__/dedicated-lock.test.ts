import { beforeEach, describe, expect, it, vi } from "vitest"

const log = vi.hoisted(() => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logger: { child: () => log } }))

const pgMock = vi.hoisted(() => {
  const instances: Array<{
    opts: unknown
    connect: ReturnType<typeof vi.fn>
    query: ReturnType<typeof vi.fn>
    end: ReturnType<typeof vi.fn>
    on: ReturnType<typeof vi.fn>
    connection: { stream: { destroy: ReturnType<typeof vi.fn> } }
  }> = []
  class Client {
    opts: unknown
    connect = vi.fn(async () => undefined)
    query = vi.fn(async () => ({ rows: [{ v: true }] }))
    end = vi.fn(async () => undefined)
    on = vi.fn()
    connection = { stream: { destroy: vi.fn() } }
    constructor(opts: unknown) {
      this.opts = opts
      instances.push(this)
    }
  }
  return { Client, instances }
})
vi.mock("pg", () => ({ default: { Client: pgMock.Client }, Client: pgMock.Client }))

import {
  acquireDedicatedLock,
  createLockConnect,
  LOCK_END_TIMEOUT_MS,
  OWNS_LOCK_SQL,
  resolveLockDbConfig,
  TRY_LOCK_SQL,
  UNLOCK_SQL,
  type LockConnection,
} from "../dedicated-lock"

const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv

function fakeConn(answer: (sql: string) => unknown): LockConnection & { query: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> } {
  return {
    query: vi.fn(async (sql: string) => answer(sql)),
    end: vi.fn(async () => undefined),
    destroy: vi.fn(),
  }
}

beforeEach(() => {
  pgMock.instances.length = 0
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe("resolveLockDbConfig", () => {
  it("prefers the discrete DATABASE_* variables the app uses", () => {
    expect(
      resolveLockDbConfig(
        env({
          DATABASE_URL: "postgresql://u:p@db:5433/other",
          DATABASE_HOST: "localhost",
          DATABASE_PORT: "5432",
          DATABASE_USER: "scrum_app",
          DATABASE_PASSWORD: "pw",
          DATABASE_NAME: "scrum_tool",
        })
      )
    ).toEqual({ host: "127.0.0.1", port: 5432, user: "scrum_app", password: "pw", database: "scrum_tool" })
  })

  it("falls back to DATABASE_URL (URL-decoded)", () => {
    expect(resolveLockDbConfig(env({ DATABASE_URL: "postgresql://scrum%40app:p%23w@127.0.0.1:5433/scrum_tool?x=1" }))).toEqual({
      host: "127.0.0.1",
      port: 5433,
      user: "scrum@app",
      password: "p#w",
      database: "scrum_tool",
    })
  })

  it("returns null when nothing usable is configured", () => {
    expect(resolveLockDbConfig(env({}))).toBeNull()
    expect(resolveLockDbConfig(env({ DATABASE_URL: "not a url" }))).toBeNull()
    expect(resolveLockDbConfig(env({ DATABASE_HOST: "h", DATABASE_USER: "u", DATABASE_NAME: "d", DATABASE_PORT: "abc" }))).toBeNull()
  })
})

describe("createLockConnect", () => {
  it("opens a dedicated pg connection with keep-alive and timeouts; query resolves with rows", async () => {
    const connect = createLockConnect(env({ DATABASE_HOST: "127.0.0.1", DATABASE_USER: "u", DATABASE_PASSWORD: "p", DATABASE_NAME: "d" }))
    const conn = await connect()
    const client = pgMock.instances[0]
    expect(client.opts).toEqual(
      expect.objectContaining({
        host: "127.0.0.1",
        port: 5432,
        user: "u",
        password: "p",
        database: "d",
        keepAlive: true,
        connectionTimeoutMillis: 10_000,
        statement_timeout: 15_000,
        query_timeout: 20_000,
      })
    )
    expect(client.connect).toHaveBeenCalledTimes(1)
    // A dropped connection must not crash the worker (an "error" listener is attached).
    expect(client.on).toHaveBeenCalledWith("error", expect.any(Function))
    await expect(conn.query("SELECT 1", [])).resolves.toEqual([{ v: true }])
    await conn.end()
    expect(client.end).toHaveBeenCalledTimes(1)
  })

  it("destroy() tears the socket down; a hanging end() falls back to destroy after LOCK_END_TIMEOUT_MS", async () => {
    vi.useFakeTimers()
    const conn = await createLockConnect(env({ DATABASE_HOST: "h", DATABASE_USER: "u", DATABASE_PASSWORD: "p", DATABASE_NAME: "d" }))()
    const client = pgMock.instances[0]
    conn.destroy?.()
    expect(client.connection.stream.destroy).toHaveBeenCalledTimes(1)
    client.end.mockImplementation(() => new Promise(() => undefined)) // never settles
    const ended = conn.end()
    await vi.advanceTimersByTimeAsync(LOCK_END_TIMEOUT_MS + 1)
    await expect(ended).resolves.toBeUndefined()
    expect(client.connection.stream.destroy).toHaveBeenCalledTimes(2)
    expect(log.warn).toHaveBeenCalledWith("lock connection did not close in time; destroyed", expect.objectContaining({ timeoutMs: LOCK_END_TIMEOUT_MS }))
  })

  it("logs a dropped connection once at warn (the error handler no longer swallows silently)", async () => {
    await createLockConnect(env({ DATABASE_HOST: "h", DATABASE_USER: "u", DATABASE_PASSWORD: "p", DATABASE_NAME: "d" }))()
    const handler = pgMock.instances[0].on.mock.calls.find((c) => c[0] === "error")?.[1] as (e: Error) => void
    handler(new Error("Connection terminated unexpectedly"))
    handler(new Error("again"))
    expect(log.warn).toHaveBeenCalledTimes(1)
    expect(log.warn).toHaveBeenCalledWith("lock connection error", { error: "Connection terminated unexpectedly" })
  })

  it("rejects without leaking credentials when not configured", async () => {
    await expect(createLockConnect(env({}))()).rejects.toThrow(/not configured/)
    expect(pgMock.instances).toHaveLength(0)
  })
})

describe("acquireDedicatedLock", () => {
  it("acquires, verifies ownership on the same connection and releases once", async () => {
    const conn = fakeConn(() => [{ v: true }])
    const handle = await acquireDedicatedLock(async () => conn, "kanflow_worker")
    expect(handle).not.toBeNull()
    expect(conn.query).toHaveBeenCalledWith(TRY_LOCK_SQL, ["kanflow_worker"])
    expect(TRY_LOCK_SQL).toContain("pg_try_advisory_lock(hashtextextended($1, 0))")
    await expect(handle!.verify()).resolves.toBe(true)
    expect(conn.query).toHaveBeenLastCalledWith(OWNS_LOCK_SQL, ["kanflow_worker"])
    expect(OWNS_LOCK_SQL).toContain("pid = pg_backend_pid()")
    await Promise.all([handle!.release(), handle!.release()])
    expect(conn.query).toHaveBeenLastCalledWith(UNLOCK_SQL, ["kanflow_worker"])
    expect(conn.end).toHaveBeenCalledTimes(1)
    await expect(handle!.verify()).resolves.toBe(false)
  })

  it("returns null and closes the connection when another session holds the lock", async () => {
    const conn = fakeConn(() => [{ v: false }])
    await expect(acquireDedicatedLock(async () => conn, "kanflow_worker")).resolves.toBeNull()
    expect(conn.end).toHaveBeenCalledTimes(1)
  })

  it("rejects when the database is unreachable", async () => {
    await expect(acquireDedicatedLock(async () => Promise.reject(new Error("ECONNREFUSED")), "x")).rejects.toThrow("ECONNREFUSED")
  })

  it("closes the connection and rethrows when the lock attempt itself fails", async () => {
    const conn = fakeConn(() => {
      throw new Error("server gone")
    })
    conn.end.mockRejectedValue(new Error("already closed"))
    await expect(acquireDedicatedLock(async () => conn, "x")).rejects.toThrow("server gone")
    expect(conn.destroy).toHaveBeenCalled()
  })

  it("verify() is false when the connection dropped (lock lost)", async () => {
    let dropped = false
    const conn = fakeConn((sql) => {
      if (dropped) throw new Error("Connection closed")
      return sql.includes("pg_locks") ? [{ v: false }] : [{ v: true }]
    })
    const handle = await acquireDedicatedLock(async () => conn, "x")
    await expect(handle!.verify()).resolves.toBe(false)
    dropped = true
    await expect(handle!.verify()).resolves.toBe(false)
    await expect(handle!.verify()).resolves.toBe(false)
    // The failing verify query is logged once (not every heartbeat).
    expect(log.warn).toHaveBeenCalledTimes(1)
    expect(log.warn).toHaveBeenCalledWith("lock ownership check failed", { lock: "x", error: "Connection closed" })
    await expect(handle!.release()).resolves.toBeUndefined()
  })
})
