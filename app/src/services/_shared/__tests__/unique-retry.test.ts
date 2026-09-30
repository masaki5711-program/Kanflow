import { describe, expect, it, vi } from "vitest"
import { prismaError } from "@/services/__tests__/support"
import { UNIQUE_RETRY_ATTEMPTS, retryOnUniqueViolation } from "../unique-retry"

describe("retryOnUniqueViolation", () => {
  it("returns the first successful result without retrying", async () => {
    const fn = vi.fn(async () => "ok")
    await expect(retryOnUniqueViolation(fn)).resolves.toBe("ok")
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("retries after a P2002 and returns the later success", async () => {
    const fn = vi.fn().mockRejectedValueOnce(prismaError("P2002")).mockResolvedValueOnce("second")
    await expect(retryOnUniqueViolation(fn)).resolves.toBe("second")
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it("passes the 1-based attempt number", async () => {
    const fn = vi.fn().mockRejectedValueOnce(prismaError("P2002")).mockResolvedValueOnce("x")
    await retryOnUniqueViolation(fn)
    expect(fn.mock.calls.map((c) => c[0])).toEqual([1, 2])
  })

  it("gives up after the attempt budget and rethrows the last P2002", async () => {
    const fn = vi.fn().mockRejectedValue(prismaError("P2002"))
    await expect(retryOnUniqueViolation(fn)).rejects.toMatchObject({ code: "P2002" })
    expect(fn).toHaveBeenCalledTimes(UNIQUE_RETRY_ATTEMPTS)
  })

  it("does not retry other errors", async () => {
    const fn = vi.fn().mockRejectedValue(prismaError("P2025"))
    await expect(retryOnUniqueViolation(fn)).rejects.toMatchObject({ code: "P2025" })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("honours a custom attempt count", async () => {
    const fn = vi.fn().mockRejectedValue(prismaError("P2002"))
    await expect(retryOnUniqueViolation(fn, 5)).rejects.toThrow()
    expect(fn).toHaveBeenCalledTimes(5)
  })
})
