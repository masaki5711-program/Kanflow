import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const m = vi.hoisted(() => ({ adapterArgs: [] as unknown[], clientArgs: [] as unknown[] }))

vi.mock("@prisma/adapter-mariadb", () => ({
  PrismaMariaDb: class {
    constructor(opts: unknown) {
      m.adapterArgs.push(opts)
    }
  },
}))
vi.mock("@/generated/prisma/client", () => ({
  PrismaClient: class {
    constructor(opts: unknown) {
      m.clientArgs.push(opts)
    }
  },
}))

const g = globalThis as unknown as { prisma?: unknown }

async function load() {
  vi.resetModules()
  return import("@/lib/prisma")
}

beforeEach(() => {
  m.adapterArgs.length = 0
  m.clientArgs.length = 0
  delete g.prisma
})
afterEach(() => {
  vi.unstubAllEnvs()
  delete g.prisma
})

describe("prisma client", () => {
  it("uses dev defaults and caches the client globally outside production", async () => {
    vi.stubEnv("NODE_ENV", "development")
    for (const k of ["DATABASE_HOST", "DATABASE_PORT", "DATABASE_USER", "DATABASE_NAME"]) vi.stubEnv(k, "")
    vi.stubEnv("DATABASE_PASSWORD", "pw")
    const { prisma } = await load()
    expect(m.adapterArgs[0]).toMatchObject({
      host: "localhost",
      port: 3306,
      user: "root",
      password: "pw",
      database: "scrum_tool",
      allowPublicKeyRetrieval: true,
    })
    expect(g.prisma).toBe(prisma)
    // A second load reuses the cached instance.
    const again = await load()
    expect(again.prisma).toBe(prisma)
    expect(m.clientArgs).toHaveLength(1)
  })

  it("uses explicit env values", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("DATABASE_HOST", "db")
    vi.stubEnv("DATABASE_PORT", "3307")
    vi.stubEnv("DATABASE_USER", "app")
    vi.stubEnv("DATABASE_PASSWORD", "secret")
    vi.stubEnv("DATABASE_NAME", "kanflow")
    await load()
    expect(m.adapterArgs[0]).toMatchObject({ host: "db", port: 3307, user: "app", database: "kanflow" })
    expect(g.prisma).toBeUndefined()
  })

  it("fails fast in production when a required variable is missing", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("DATABASE_HOST", "")
    vi.stubEnv("DATABASE_PASSWORD", "x")
    await expect(load()).rejects.toThrow("Required environment variable DATABASE_HOST is not set")
  })

  it("requires a password even in development", async () => {
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("DATABASE_PASSWORD", "")
    await expect(load()).rejects.toThrow("DATABASE_PASSWORD")
  })
})
