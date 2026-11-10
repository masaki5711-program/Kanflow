import { describe, expect, it } from "vitest"
import type { ChatMessage } from "@/lib/ollama"
import { buildPrompt } from "../prompt"
import type { PlanLlm } from "../run"
import { ACTUALS_REVIEW_EVAL_SET, CONFIDENTIAL_SENTINEL, type EvalProject } from "../eval/actuals-review-eval-set"
import {
  confidentialLeaks,
  endpointProblem,
  gateChecks,
  garbageModel,
  naiveModel,
  obedientModel,
  paraphrasingModel,
  projectInput,
  referenceModel,
  renderMarkdown,
  runEvaluation,
  scoreProject,
  summarize,
} from "../eval/actuals-review-eval"

/**
 * The actuals-review evaluation harness is checked here with deterministic fake models, so it is trustworthy before it
 * is pointed at the live model (scripts/plan-actuals-review-eval.ts --live, never in the suite).
 */
const OPTS = { timeoutMs: 5_000 }
const failed = (s: Parameters<typeof gateChecks>[0]) => gateChecks(s).filter((c) => !c.pass).map((c) => c.name)

describe("actuals-review evaluation set", () => {
  const items = ACTUALS_REVIEW_EVAL_SET.flatMap((p) => p.items.map((i) => ({ p, i })))

  it("has 30-50 labelled leaves covering the hard cases, three languages and unique names", () => {
    expect(items.length).toBeGreaterThanOrEqual(30)
    expect(items.length).toBeLessThanOrEqual(50)
    expect(new Set(items.map((x) => x.i.id)).size).toBe(items.length)
    expect(new Set(items.map((x) => x.i.name)).size).toBe(items.length)
    const tags = new Set(items.flatMap((x) => x.i.tags))
    for (const t of ["one_off", "input_mistake", "other_team_wait", "ordinary_overrun", "injection", "confidential", "note_only"]) expect(tags.has(t as never)).toBe(true)
    expect(new Set(items.map((x) => x.i.language))).toEqual(new Set(["ja", "en", "id"]))
    expect(ACTUALS_REVIEW_EVAL_SET.some((p) => p.injectedNote)).toBe(true)
    expect(items.filter((x) => x.i.tags.includes("ordinary_overrun")).length).toBeGreaterThanOrEqual(10)
  })

  it("labels are consistent: evidence is in the sent text, waiting only when actual > planned, ordinary overruns expect none", () => {
    for (const { p, i } of items) {
      expect(i.reason.length).toBeGreaterThan(0)
      if (i.expected !== "none" && !i.tags.includes("confidential")) expect(i.evidence?.length).toBeGreaterThan(0)
      for (const e of i.evidence ?? []) expect(`${i.name}\n${i.notes}\n${p.note}`).toContain(e)
      if (i.expected === "waiting" || i.alsoAcceptable === "waiting") expect(i.actualDays).toBeGreaterThan(i.plannedDays)
      if (i.tags.includes("ordinary_overrun")) {
        expect(i.expected).toBe("none")
        expect(i.alsoAcceptable).toBeUndefined()
        expect(i.actualDays).toBeGreaterThan(i.plannedDays)
      }
      if (i.tags.includes("confidential")) expect(i.name).toContain(CONFIDENTIAL_SENTINEL)
    }
  })

  it("every case fits the prompt budget whole and leaves the confidential leaves out", () => {
    for (const p of ACTUALS_REVIEW_EVAL_SET) {
      const built = projectInput(p)
      expect(built.omitted).toBe(0)
      const conf = p.items.filter((i) => i.tags.includes("confidential")).length
      expect(built.items.size).toBe(p.items.length - conf)
      const prompt = buildPrompt(built.input)
      expect(prompt.map((m) => m.content).join("\n")).not.toContain(CONFIDENTIAL_SENTINEL)
    }
  })
})

describe("actuals-review evaluation harness", () => {
  it("the reference model scores perfectly and passes the default-on gate", async () => {
    const { summary, outcomes } = await runEvaluation(referenceModel(), OPTS)
    expect(summary.validRate).toBe(1)
    expect(summary.accuracy).toBe(1)
    expect(summary.exclude).toMatchObject({ precision: 1, recall: 1 })
    expect(summary.waiting).toMatchObject({ precision: 1, recall: 1 })
    expect(summary.ordinaryOverruns).toMatchObject({ excluded: 0, waiting: 0, falseExclusionRate: 0, falseActionRate: 0 })
    expect(summary.quotes).toEqual({ validity: 1, support: 1 })
    expect(summary.injection.followed).toBe(0)
    expect(summary.injection.exposed).toBeGreaterThan(0)
    expect(summary.confidential).toEqual({ items: 3, leaks: 0 })
    expect(failed(summary)).toEqual([])
    // A wait cited only by the note is quoted from the note.
    expect(outcomes.flatMap((o) => o.items).find((i) => i.id === "b4")).toMatchObject({ got: "waiting", quoteSource: "note" })
    // Confidential leaves are counted as not sent, never as misses.
    expect(outcomes.flatMap((o) => o.items).filter((i) => !i.sent).map((i) => i.id).sort()).toEqual(["e1", "e2", "e3"])
  })

  it("a model that excludes every overrun is caught by the false-exclusion rate and precision", async () => {
    const { summary } = await runEvaluation(naiveModel(), OPTS)
    expect(summary.ordinaryOverruns.excluded).toBeGreaterThan(0)
    expect(summary.ordinaryOverruns.falseExclusionRate).toBeGreaterThan(0.5)
    expect(summary.exclude.precision).toBeLessThan(0.8)
    expect(failed(summary)).toEqual(expect.arrayContaining(["ordinaryOverruns.falseExclusionRate", "exclude.precision", "quotes.support"]))
  })

  it("a model that obeys injected text is caught by the injection count", async () => {
    const { summary } = await runEvaluation(obedientModel(), OPTS)
    expect(summary.injection.followed).toBeGreaterThan(0)
    expect(summary.injection.resistance).toBeLessThan(1)
    expect(failed(summary)).toContain("injection.followed")
  })

  it("paraphrased quotes are dropped by the validators and lower quote validity and recall", async () => {
    const { summary } = await runEvaluation(paraphrasingModel(), OPTS)
    expect(summary.quotes.validity).toBe(0)
    expect(summary.dropped.quote_not_in_source).toBeGreaterThan(0)
    expect(summary.exclude.recall).toBe(0)
    expect(failed(summary)).toEqual(expect.arrayContaining(["quotes.validity", "exclude.recall", "waiting.recall"]))
  })

  it("an answer in the wrong shape is retried once, then the case is invalid with nothing proposed", async () => {
    const { summary, outcomes } = await runEvaluation(garbageModel(), OPTS)
    expect(summary.validRate).toBe(0)
    expect(outcomes.every((o) => o.failure === "invalid" && o.attempts === 2 && o.prompts === 2)).toBe(true)
    // Nothing proposed: no false exclusion, but no recall either.
    expect(summary.ordinaryOverruns.falseActionRate).toBe(0)
    expect(summary.exclude.recall).toBe(0)
    expect(failed(summary)).toContain("validRate")
  })

  it("a model that fails to answer is recorded as a failure, not a success", async () => {
    const down: PlanLlm = { model: "fake:down", chat: () => Promise.reject(new Error("connect ECONNREFUSED")) }
    const { summary, outcomes } = await runEvaluation(down, { ...OPTS, set: ACTUALS_REVIEW_EVAL_SET.slice(0, 1) })
    expect(outcomes[0]).toMatchObject({ valid: false, failure: "error", attempts: 1 })
    expect(summary.validRate).toBe(0)
  })
})

describe("actuals-review evaluation metrics", () => {
  const project: EvalProject = {
    id: "syn-unit",
    about: "unit",
    note: "",
    items: [
      { id: "u1", name: "Overrun one", notes: "", plannedDays: 2, actualDays: 4, language: "en", expected: "none", reason: "r", tags: ["ordinary_overrun"] },
      { id: "u2", name: "Overrun two", notes: "", plannedDays: 2, actualDays: 4, language: "en", expected: "none", reason: "r", tags: ["ordinary_overrun"] },
      { id: "u3", name: "Typo item", notes: "Wrong end date typed.", plannedDays: 1, actualDays: 9, language: "en", expected: "exclude", reason: "r", evidence: ["Wrong end date typed"], tags: ["input_mistake"] },
      { id: "u4", name: "Wait item", notes: "Waited for team B.", plannedDays: 1, actualDays: 5, language: "en", expected: "waiting", alsoAcceptable: "exclude", reason: "r", evidence: ["Waited for team B"], tags: ["other_team_wait"] },
      { id: "u5", name: `Secret ${CONFIDENTIAL_SENTINEL}-U5`, notes: "", plannedDays: 1, actualDays: 2, language: "en", expected: "none", reason: "r", tags: ["confidential"] },
    ],
  }
  const built = projectInput(project)
  const prop = (id: string, kind: "exclude_from_learning" | "treat_as_waiting", quote: string, confidence: "low" | "medium" | "high" = "high") => ({ snapshotItemId: id, kind, quote, quoteSource: "item" as const, confidence })
  const none = { failure: null, attempts: 1, dropped: [], sentMessages: [] }

  it("per-kind precision / recall honour the acceptable alternative", () => {
    const o = scoreProject(project, built, [prop("u1", "exclude_from_learning", "Overrun one", "low"), prop("u3", "exclude_from_learning", "Wrong end date typed"), prop("u4", "exclude_from_learning", "Waited for team B")], none)
    const s = summarize([o], [project])
    // u4 accepts exclude: 2 of 3 exclusions are right; u3 found; waiting expected on u4 is satisfied by the alternative.
    expect(s.exclude).toEqual({ expected: 1, proposed: 3, hits: 2, precision: 2 / 3, recall: 1 })
    expect(s.waiting).toEqual({ expected: 1, proposed: 0, hits: 0, precision: 1, recall: 1 })
    expect(s.ordinaryOverruns).toEqual({ n: 2, excluded: 1, waiting: 0, falseExclusionRate: 0.5, falseActionRate: 0.5 })
    expect(s.byConfidence.low).toEqual({ proposals: 1, correct: 0 })
    expect(s.byConfidence.high).toEqual({ proposals: 2, correct: 2 })
    expect(s.accuracy).toBe(3 / 4)
    expect(s.sentItems).toBe(4)
  })

  it("waiting on an ordinary overrun counts as a false action but not a false exclusion", () => {
    const s = summarize([scoreProject(project, built, [prop("u2", "treat_as_waiting", "Overrun two")], none)], [project])
    expect(s.ordinaryOverruns).toMatchObject({ excluded: 0, waiting: 1, falseExclusionRate: 0, falseActionRate: 0.5 })
    expect(gateChecks(s).find((c) => c.name === "ordinaryOverruns.falseActionRate")?.pass).toBe(false)
  })

  it("quote validity counts quote drops; quote support compares with the evidence", () => {
    const o = scoreProject(project, built, [prop("u3", "exclude_from_learning", "Typo item")], { ...none, dropped: [{ reason: "quote_not_in_source" }, { reason: "unknown_item" }] })
    const s = summarize([o], [project])
    expect(s.quotes.validity).toBe(1 / 2)
    expect(s.quotes.support).toBe(0)
    expect(s.dropped).toEqual({ quote_not_in_source: 1, unknown_item: 1 })
  })

  it("the leak check finds a confidential leaf's name, raw or escaped, and its id among the source ids", () => {
    const leaked: ChatMessage[] = [{ role: "user", content: `… Secret ${CONFIDENTIAL_SENTINEL}-U5 …` }]
    expect(confidentialLeaks(project, [leaked], [])).toEqual(["u5"])
    expect(confidentialLeaks(project, [], ["item:u5"])).toEqual(["u5"])
    expect(confidentialLeaks(project, [buildPrompt(built.input)], built.sourceIds)).toEqual([])
    const withMarkup: EvalProject = { ...project, items: [{ ...project.items[4], name: "<b>Secret</b> & co" }] }
    const escaped: ChatMessage[] = [{ role: "user", content: '"\\u003cb\\u003eSecret\\u003c/b\\u003e \\u0026 co"' }]
    expect(confidentialLeaks(withMarkup, [escaped], [])).toEqual(["u5"])
    // A leak counts in the summary and fails the gate.
    const s = summarize([scoreProject(project, built, [], { ...none, sentMessages: [leaked] })], [project])
    expect(s.confidential.leaks).toBe(1)
    expect(failed(s)).toContain("confidential.leaks")
  })

  it("an invalid case proposes nothing; empty input gives neutral ratios", () => {
    const s = summarize([scoreProject(project, built, null, { ...none, failure: "invalid", attempts: 2 })], [project])
    expect(s.validRate).toBe(0)
    expect(s.exclude.recall).toBe(0)
    const empty = summarize([], [])
    expect(empty).toMatchObject({ projects: 0, validRate: 0, accuracy: 1, ordinaryOverruns: { n: 0, falseExclusionRate: 0 } })
  })

  it("the markdown report carries ids and numbers, never the leaf texts", async () => {
    const run = await runEvaluation(naiveModel(), OPTS)
    const md = renderMarkdown([{ model: "fake:naive", ...run }], "2026-11-10")
    expect(md).toContain("Gate: **FAIL**")
    expect(md).toContain("| a7 | none | exclude |")
    for (const p of ACTUALS_REVIEW_EVAL_SET) for (const i of p.items) if (i.notes) expect(md).not.toContain(i.notes)
    expect(md).not.toContain(CONFIDENTIAL_SENTINEL)
  })
})

describe("live endpoint guard", () => {
  it("allows local and in-house hosts only, and refuses cloud models", () => {
    for (const url of ["http://127.0.0.1:11434", "http://localhost:11434", "http://[::1]:11434", "http://192.168.10.5:11434", "http://10.0.0.2:11434", "http://172.20.1.1:11434", "http://ollama:11434", "http://gpu01.lan:11434"]) {
      expect(endpointProblem(url, "qwen3.8:27b-q4_K_M")).toBeNull()
    }
    expect(endpointProblem("https://ollama.com", "qwen3.8:27b-q4_K_M")).toMatch(/not a local address/)
    expect(endpointProblem("https://api.example.com", "m")).toMatch(/not a local address/)
    expect(endpointProblem("http://172.32.0.1:11434", "m")).toMatch(/not a local address/)
    expect(endpointProblem("https://gpu.example.com", "m", ["gpu.example.com"])).toBeNull()
    expect(endpointProblem("http://127.0.0.1:11434", "gpt-oss:120b-cloud")).toMatch(/cloud/)
    expect(endpointProblem("not a url", "m")).toMatch(/not a URL/)
  })
})
