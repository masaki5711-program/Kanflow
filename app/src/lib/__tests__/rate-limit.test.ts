import { describe, expect, it } from "vitest"
import {
  clientIpFromHeaders,
  createRateLimiter,
  isLoginBlocked,
  recordLoginFailure,
  recordLoginSuccess,
  retryAfterSeconds,
  type LoginLimiters,
} from "@/lib/rate-limit"

function fakeClock(start = 1_000_000) {
  let t = start
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms
    },
  }
}

describe("createRateLimiter", () => {
  it("limits after `limit` hits within the window", () => {
    const rl = createRateLimiter({ limit: 3, windowMs: 1000, now: fakeClock().now })
    expect(rl.hit("k").limited).toBe(false)
    expect(rl.hit("k").limited).toBe(false)
    const third = rl.hit("k")
    expect(third.limited).toBe(true)
    expect(third.remaining).toBe(0)
    expect(rl.peek("k").limited).toBe(true)
  })

  it("slides the window so old hits expire", () => {
    const clock = fakeClock()
    const rl = createRateLimiter({ limit: 2, windowMs: 1000, now: clock.now })
    rl.hit("k")
    clock.advance(600)
    rl.hit("k")
    expect(rl.peek("k").limited).toBe(true)
    expect(rl.peek("k").retryAfterMs).toBe(400)
    clock.advance(401)
    expect(rl.peek("k").limited).toBe(false)
    expect(rl.peek("k").remaining).toBe(1)
  })

  it("keeps keys independent and supports reset", () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 1000, now: fakeClock().now })
    rl.hit("a")
    expect(rl.peek("a").limited).toBe(true)
    expect(rl.peek("b").limited).toBe(false)
    rl.reset("a")
    expect(rl.peek("a").limited).toBe(false)
  })

  it("peek does not record hits", () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 1000, now: fakeClock().now })
    rl.peek("a")
    rl.peek("a")
    expect(rl.peek("a").limited).toBe(false)
  })

  it("sweeps expired keys when maxKeys is reached", () => {
    const clock = fakeClock()
    const rl = createRateLimiter({ limit: 5, windowMs: 100, maxKeys: 2, now: clock.now })
    rl.hit("a")
    rl.hit("b")
    clock.advance(200)
    rl.hit("c")
    expect(rl.size()).toBe(1)
  })

  it("rejects invalid options", () => {
    expect(() => createRateLimiter({ limit: 0, windowMs: 10 })).toThrow()
  })

  it("formats Retry-After in whole seconds (min 1)", () => {
    expect(retryAfterSeconds({ limited: true, remaining: 0, retryAfterMs: 1500 })).toBe("2")
    expect(retryAfterSeconds({ limited: true, remaining: 0, retryAfterMs: 0 })).toBe("1")
  })
})

describe("login throttle", () => {
  function limiters(): LoginLimiters {
    const clock = fakeClock()
    return {
      byUser: createRateLimiter({ limit: 3, windowMs: 1000, now: clock.now }),
      byIp: createRateLimiter({ limit: 5, windowMs: 1000, now: clock.now }),
    }
  }

  it("blocks a username after repeated failures (case-insensitive)", () => {
    const l = limiters()
    for (let i = 0; i < 3; i++) recordLoginFailure(l, "Alice@x", "1.1.1.1")
    expect(isLoginBlocked(l, "alice@x", "2.2.2.2")).toBe(true)
    expect(isLoginBlocked(l, "bob@x", "2.2.2.2")).toBe(false)
  })

  it("blocks an IP after failures across usernames", () => {
    const l = limiters()
    for (let i = 0; i < 5; i++) recordLoginFailure(l, `u${i}`, "9.9.9.9")
    expect(isLoginBlocked(l, "fresh", "9.9.9.9")).toBe(true)
    expect(isLoginBlocked(l, "fresh", null)).toBe(false)
  })

  it("clears the per-user counter on success", () => {
    const l = limiters()
    recordLoginFailure(l, "a", null)
    recordLoginFailure(l, "a", null)
    recordLoginSuccess(l, "a")
    recordLoginFailure(l, "a", null)
    expect(isLoginBlocked(l, "a", null)).toBe(false)
  })
})

describe("clientIpFromHeaders", () => {
  it("prefers the first x-forwarded-for entry", () => {
    expect(clientIpFromHeaders(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe(
      "1.2.3.4"
    )
    expect(clientIpFromHeaders(new Headers({ "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8")
    expect(clientIpFromHeaders(new Headers())).toBeNull()
    expect(clientIpFromHeaders(undefined)).toBeNull()
  })
})

describe("consume (check and record in one step)", () => {
  it("records a hit only while under the limit", () => {
    let t = 0
    const l = createRateLimiter({ limit: 2, windowMs: 1000, now: () => t })
    expect(l.consume("k").allowed).toBe(true)
    expect(l.consume("k").allowed).toBe(true)
    const over = l.consume("k")
    expect(over.allowed).toBe(false)
    expect(over.status.limited).toBe(true)
    t = 1001
    expect(l.consume("k").allowed).toBe(true)
  })
})
