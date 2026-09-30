import { describe, expect, test } from "vitest"
import { BACKOFF_BASE_MS, MAX_ATTEMPTS, nextState } from "../worker-state"

const now = new Date("2026-09-10T00:00:00Z")

describe("nextState", () => {
  test("success → done with the translation and model", () => {
    const s = nextState({ attempts: 2 }, { kind: "success", translated: "Halo", model: "qwen" }, now)
    expect(s).toMatchObject({ status: "done", attempts: 2, lastError: null, requestedAt: null, translated: "Halo", model: "qwen" })
  })

  test("preempted → back to pending immediately, attempts unchanged", () => {
    const s = nextState({ attempts: 3 }, { kind: "preempted" }, now)
    expect(s).toMatchObject({ status: "pending", attempts: 3, lastError: null })
    expect(s.requestedAt).toEqual(now)
  })

  test("failure → pending with linear backoff", () => {
    const s = nextState({ attempts: 1 }, { kind: "failure", error: "boom" }, now)
    expect(s).toMatchObject({ status: "pending", attempts: 2, lastError: "boom" })
    expect(s.requestedAt?.getTime()).toBe(now.getTime() + 2 * BACKOFF_BASE_MS)
  })

  test("failure at the last attempt → failed", () => {
    const s = nextState({ attempts: MAX_ATTEMPTS - 1 }, { kind: "failure", error: "boom" }, now)
    expect(s).toMatchObject({ status: "failed", attempts: MAX_ATTEMPTS, lastError: "boom", requestedAt: null })
  })
})
