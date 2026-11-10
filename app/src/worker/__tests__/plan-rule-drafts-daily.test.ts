import { describe, expect, it, vi } from "vitest"

/** The night batch runs the rule drafts, then the AI review of actuals — the review runs even if the drafts throw. */
const m = vi.hoisted(() => ({ runs: [] as (() => Promise<unknown>)[], drafts: vi.fn(), reviews: vi.fn(), llm: { model: "fake" } }))

vi.mock("../scheduler", () => ({
  DailyScheduler: class {
    constructor(opts: { run: () => Promise<unknown> }) {
      m.runs.push(opts.run)
    }
    start() {}
    nextAt() {
      return null
    }
  },
}))
vi.mock("@/services/plan-llm/rule-drafts.service", () => ({ runRuleDraftBatch: m.drafts }))
vi.mock("@/services/plan-llm/actuals-review.service", () => ({ runActualsReviewBatch: m.reviews }))
vi.mock("@/lib/plan-llm/ollama-llm", () => ({ planLlmFromEnv: () => m.llm }))

const { startPlanRuleDraftScheduler } = await import("../plan-rule-drafts-daily")
const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }

describe("plan rule-draft night batch", () => {
  it("runs the drafts, then the actuals review, with the same LLM at background turn-taking", async () => {
    m.drafts.mockResolvedValue({ results: [], recovered: 0 })
    m.reviews.mockResolvedValue({ results: [], recovered: 0 })
    const waitForTurn = vi.fn()
    startPlanRuleDraftScheduler({ planRuleDraftTimes: [{ hour: 2, minute: 30 }] }, log, undefined, waitForTurn)
    await expect(m.runs.at(-1)!()).resolves.toEqual({ drafts: { results: [], recovered: 0 }, reviews: { results: [], recovered: 0 } })
    expect(m.reviews).toHaveBeenCalledWith(expect.objectContaining({ llm: m.llm, waitForTurn }))
  })

  it("a failing drafts batch does not starve the review; the failure is rethrown for the scheduler's log", async () => {
    m.drafts.mockRejectedValue(new Error("db down"))
    m.reviews.mockClear().mockResolvedValue({ results: [], recovered: 0 })
    startPlanRuleDraftScheduler({ planRuleDraftTimes: [{ hour: 2, minute: 30 }] }, log)
    await expect(m.runs.at(-1)!()).rejects.toThrow("db down")
    expect(m.reviews).toHaveBeenCalledTimes(1)
  })
})
