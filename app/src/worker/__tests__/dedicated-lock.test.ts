import { beforeEach, describe, expect, it, vi } from "vitest"

const createConnection = vi.hoisted(() => vi.fn())
vi.mock("mariadb", () => ({ createConnection, default: { createConnection } }))

import { acquireDedicatedLock, createLockConnect, resolveLockDbConfig, type LockConnection } from "../dedicated-lock"

const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv

function fakeConn(answer: (sql: string) => unknown): LockConnection & { query: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> } {
  return {
    query: vi.fn(async (sql: string) => answer(sql)),
    end: vi.fn(async () => undefined),
    destroy: vi.fn(),
  }
}

beforeEach(() => createConnection.mockReset())

describe("resolveLockDbConfig", () => {
  it("prefers the discrete DATABASE_* variables the app uses", () => {
    expect(
      resolveLockDbConfig(
        env({
          DATABASE_URL: "mysql://u:p@db:3307/other",
          DATABASE_HOST: "localhost",
          DATABASE_PORT: "3306",
          DATABASE_USER: "scrum_app",
          DATABASE_PASSWORD: "pw",
          DATABASE_NAME: "scrum_tool",
        })
      )
    ).toEqual({ host: "127.0.0.1", port: 3306, user: "scrum_app", password: "pw", database: "scrum_tool" })
  })

  it("falls back to DATABASE_URL (URL-decoded)", () => {
    expect(resolveLockDbConfig(env({ DATABASE_URL: "mysql://scrum%40app:p%23w@127.0.0.1:3307/scrum_tool?x=1" }))).toEqual({
      host: "127.0.0.1",
      port: 3307,
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
  it("opens a dedicated mariadb connection with keep-alive", async () => {
    createConnection.mockResolvedValue("CONN")
    const connect = createLockConnect(env({ DATABASE_HOST: "127.0.0.1", DATABASE_USER: "u", DATABASE_PASSWORD: "p", DATABASE_NAME: "d" }))
    await expect(connect()).resolves.toBe("CONN")
    expect(createConnection).toHaveBeenCalledWith(
      expect.objectContaining({ host: "127.0.0.1", port: 3306, user: "u", password: "p", database: "d", keepAliveDelay: 30_000, allowPublicKeyRetrieval: true })
    )
  })

  it("rejects without leaking credentials when not configured", async () => {
    await expect(createLockConnect(env({}))()).rejects.toThrow(/not configured/)
    expect(createConnection).not.toHaveBeenCalled()
  })
})

describe("acquireDedicatedLock", () => {
  it("acquires, verifies ownership on the same connection and releases once", async () => {
    const conn = fakeConn(() => [{ v: BigInt(1) }])
    const handle = await acquireDedicatedLock(async () => conn, "kanflow_worker")
    expect(handle).not.toBeNull()
    expect(conn.query).toHaveBeenCalledWith("SELECT GET_LOCK(?, 0) AS v", ["kanflow_worker"])
    await expect(handle!.verify()).resolves.toBe(true)
    expect(conn.query).toHaveBeenLastCalledWith("SELECT IS_USED_LOCK(?) = CONNECTION_ID() AS v", ["kanflow_worker"])
    await Promise.all([handle!.release(), handle!.release()])
    expect(conn.query).toHaveBeenLastCalledWith("SELECT RELEASE_LOCK(?) AS v", ["kanflow_worker"])
    expect(conn.end).toHaveBeenCalledTimes(1)
    await expect(handle!.verify()).resolves.toBe(false)
  })

  it("returns null and closes the connection when another session holds the lock", async () => {
    const conn = fakeConn(() => [{ v: 0 }])
    await expect(acquireDedicatedLock(async () => conn, "kanflow_worker")).resolves.toBeNull()
    expect(conn.end).toHaveBeenCalledTimes(1)
  })

  it("rejects when the database is unreachable", async () => {
    await expect(acquireDedicatedLock(async () => Promise.reject(new Error("ECONNREFUSED")), "x")).rejects.toThrow("ECONNREFUSED")
  })

  it("closes the connection and rethrows when GET_LOCK itself fails", async () => {
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
      return sql.includes("IS_USED_LOCK") ? [{ v: 0 }] : [{ v: 1 }]
    })
    const handle = await acquireDedicatedLock(async () => conn, "x")
    await expect(handle!.verify()).resolves.toBe(false)
    dropped = true
    await expect(handle!.verify()).resolves.toBe(false)
    await expect(handle!.release()).resolves.toBeUndefined()
  })
})
