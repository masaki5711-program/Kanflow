import { describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())

const quota = await import("../storage-quota")

const MB = 1024 * 1024

function dbReturning(total: unknown) {
  const queryRaw = vi.fn(async () => [{ total }])
  return { db: { $queryRaw: queryRaw } as never, queryRaw }
}

describe("projectQuotaBytes", () => {
  it("defaults to 5120 MB", () => {
    expect(quota.projectQuotaBytes({})).toBe(5120 * MB)
    expect(quota.DEFAULT_PROJECT_QUOTA_MB).toBe(5120)
  })

  it("reads ATTACHMENT_PROJECT_QUOTA_MB", () => {
    expect(quota.projectQuotaBytes({ ATTACHMENT_PROJECT_QUOTA_MB: "100" })).toBe(100 * MB)
    expect(quota.projectQuotaBytes({ ATTACHMENT_PROJECT_QUOTA_MB: " 1.5 " })).toBe(1.5 * MB)
  })

  it("treats 0 as unlimited", () => {
    expect(quota.projectQuotaBytes({ ATTACHMENT_PROJECT_QUOTA_MB: "0" })).toBeNull()
  })

  it.each(["", "abc", "-5", "Infinity"])("falls back to the default for invalid value %j", (v) => {
    expect(quota.projectQuotaBytes({ ATTACHMENT_PROJECT_QUOTA_MB: v })).toBe(5120 * MB)
  })
})

describe("projectStorageUsed", () => {
  it("sums project, icebox and team-chat attachment sizes in one parameterized query", async () => {
    const { db, queryRaw } = dbReturning("2147483648")
    await expect(quota.projectStorageUsed(db, "p1")).resolves.toBe(2147483648)
    const [strings, ...values] = queryRaw.mock.calls[0] as unknown as [TemplateStringsArray, ...unknown[]]
    expect(strings.join("?")).toMatch(/ProjectAttachment[\s\S]*IceboxAttachment[\s\S]*IceboxItem[\s\S]*TeamMessageAttachment[\s\S]*TeamMessage/)
    expect(values).toEqual(["p1", "p1", "p1"])
  })

  it("handles numeric / bigint / missing results", async () => {
    await expect(quota.projectStorageUsed(dbReturning(5).db, "p1")).resolves.toBe(5)
    await expect(quota.projectStorageUsed(dbReturning(BigInt(7)).db, "p1")).resolves.toBe(7)
    await expect(quota.projectStorageUsed(dbReturning(null).db, "p1")).resolves.toBe(0)
  })
})

describe("assertStorageQuota", () => {
  it("passes when the new file fits", async () => {
    const { db } = dbReturning(String(99 * MB))
    await expect(quota.assertStorageQuota("p1", MB, { ATTACHMENT_PROJECT_QUOTA_MB: "100" }, db)).resolves.toBeUndefined()
  })

  it("throws 413 STORAGE_QUOTA_EXCEEDED when the new file would exceed the quota", async () => {
    const { db } = dbReturning(String(99 * MB))
    await expect(quota.assertStorageQuota("p1", MB + 1, { ATTACHMENT_PROJECT_QUOTA_MB: "100" }, db)).rejects.toMatchObject({
      status: 413,
      code: "STORAGE_QUOTA_EXCEEDED",
    })
  })

  it("skips the DB entirely when the quota is unlimited", async () => {
    const { db, queryRaw } = dbReturning("0")
    await quota.assertStorageQuota("p1", 10 * MB, { ATTACHMENT_PROJECT_QUOTA_MB: "0" }, db)
    expect(queryRaw).not.toHaveBeenCalled()
  })
})
