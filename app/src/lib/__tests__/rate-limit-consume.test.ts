import { describe, expect, it } from "vitest"
import { consumeRateLimit } from "@/lib/rate-limit"

describe("consumeRateLimit", () => {
  it("allows hits up to the limit then returns a Retry-After value", () => {
    // Arrange
    const opts = { limit: 2, windowMs: 60_000 }
    const name = `test-${Math.random()}`

    // Act
    const results = [1, 2, 3].map(() => consumeRateLimit(name, opts, "user-1"))

    // Assert
    expect(results[0]).toBeNull()
    expect(results[1]).toBeNull()
    expect(Number(results[2])).toBeGreaterThan(0)
  })

  it("tracks keys independently", () => {
    // Arrange
    const opts = { limit: 1, windowMs: 60_000 }
    const name = `test-${Math.random()}`
    consumeRateLimit(name, opts, "user-1")

    // Act
    const other = consumeRateLimit(name, opts, "user-2")

    // Assert
    expect(other).toBeNull()
  })
})
