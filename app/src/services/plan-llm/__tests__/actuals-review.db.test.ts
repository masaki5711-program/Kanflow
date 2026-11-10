import { afterAll, beforeAll, describe, expect, it } from "vitest"

/**
 * AI review of finalized actuals (handoff 2026-11-05 "次の案" 1) against a REAL PostgreSQL, with a FAKE LLM (nothing
 * reaches Ollama). Skipped unless KANFLOW_DB_TESTS=1 and DATABASE_* point at a migrated, disposable test database
 * (synthetic rows only, removed afterwards):
 *
 *   KANFLOW_DB_TESTS=1 npx vitest run src/services/plan-llm/__tests__/actuals-review.db.test.ts
 *
 * Scenario: project P (PO u1) with a finalized snapshot of three complete leaves — 検査 (planned 5, actual 12; its plan
 * row's notes say it waited for parts), 設計 (planned 5, actual 20; notes say the end date was mistyped) and 秘密 (cites
 * a PBI that is confidential). The lineage has a recorded backtest computed from the current snapshots.
 */
const enabled = process.env.KANFLOW_DB_TESTS === "1"
const d = (s: string) => new Date(`${s}T00:00:00.000Z`)

type ChatMessage = import("@/lib/ollama").ChatMessage
type PlanLlm = import("@/lib/plan-llm/run").PlanLlm
const { promptData } = await import("@/lib/plan-llm/prompt")

function fakeLlm(answer: (data: Record<string, unknown>, call: number) => string | Error | Promise<string | Error>) {
  const calls: { messages: ChatMessage[]; priority: string }[] = []
  const llm: PlanLlm = {
    model: "fake-model",
    async chat(messages, call) {
      calls.push({ messages, priority: call.priority })
      const out = await answer(promptData(messages) ?? {}, calls.length)
      if (out instanceof Error) throw out
      return out
    },
  }
  return { llm, calls, text: () => JSON.stringify(calls.map((c) => c.messages)) }
}

/** The iid the prompt gave the leaf named `name`. */
const iidOf = (data: Record<string, unknown>, name: string) => (data.items as { iid: string; name: string }[]).find((i) => i.name === name)?.iid ?? "missing"

describe.skipIf(!enabled)("AI review of actuals on a real database (KANFLOW_DB_TESTS=1)", () => {
  const tag = `artest-${Date.now().toString(36)}`
  const lineage = `${tag}-line`
  const ids = { p: `${tag}-p`, u1: `${tag}-u1`, pbiOk: `${tag}-pbi1`, pbiSecret: `${tag}-pbi2` }
  const po = { userId: ids.u1, userName: "PO", systemRole: "member" }
  const config = { enabled: true, interactiveTimeoutMs: 10_000, batchTimeoutMs: 10_000 }

  let prisma: typeof import("@/lib/prisma").prisma
  let batch: typeof import("../actuals-review.service")
  let review: typeof import("@/services/plan-actuals/actuals-review.service")
  let learn: typeof import("@/services/plan-actuals/actuals.learnable")
  let gate: typeof import("@/services/plan-estimate-run/gate")
  let evals: typeof import("@/services/plan-estimate-eval/eval.service")
  let errors: typeof import("@/lib/ollama/errors")
  let snapshotId = ""
  const leaf: Record<string, string> = {}

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma
    batch = await import("../actuals-review.service")
    review = await import("@/services/plan-actuals/actuals-review.service")
    learn = await import("@/services/plan-actuals/actuals.learnable")
    gate = await import("@/services/plan-estimate-run/gate")
    evals = await import("@/services/plan-estimate-eval/eval.service")
    errors = await import("@/lib/ollama/errors")
    await prisma.user.create({ data: { id: ids.u1, name: "PO 太郎", email: `${ids.u1}@example.test`, password: "synthetic" } })
    await prisma.project.create({ data: { id: ids.p, name: `${tag}-名前`, projectType: `t-${tag}`.slice(0, 40) } })
    await prisma.projectMember.create({ data: { projectId: ids.p, userId: ids.u1, role: "po" } })
    const rows: [string, string, number, number, string | null][] = [
      ["inspect", "検査", 5, 12, "部品の入荷待ちで 1 週間止まった"],
      ["design", "設計", 5, 20, "終了日の入力ミスで 2 週間長くなっている"],
      ["secret", "秘密の作業 SECRETITEM", 5, 9, "SECRETNOTE 顧客名入り"],
    ]
    // The live plan rows were edited after finalize: the review must read the frozen text, never this.
    for (const [key, name] of rows) await prisma.planItem.create({ data: { id: `${tag}-${key}`, projectId: ids.p, name, notes: `LIVEEDIT ${key} 入力ミス` } })
    await prisma.productBacklogItem.create({ data: { id: ids.pbiOk, projectId: ids.p, displayId: 1, initiative: "synthetic" } })
    await prisma.productBacklogItem.create({ data: { id: ids.pbiSecret, projectId: ids.p, displayId: 2, initiative: "synthetic", confidential: true } })
    const snap = await prisma.planActualsSnapshot.create({
      data: { projectId: ids.p, projectType: `t-${tag}`.slice(0, 40), lineage, closedAt: d("2026-10-15"), firstFinalizedAt: d("2026-10-16"), finalizedAt: d("2026-10-16"), methodVersion: "e1-v1", finalizeNote: "全体として大きな問題は無かった。" },
    })
    snapshotId = snap.id
    for (const [key, name, planned, actual, notes] of rows) {
      const it = await prisma.planActualsItem.create({ data: { snapshotId, planItemId: `${tag}-${key}`, templateKey: key, name, notes, templateDays: planned, plannedDays: planned, actualDays: actual, waitGapDays: 1, complete: true } })
      leaf[key] = it.id
    }
    await prisma.planActualsItemPbi.create({ data: { snapshotItemId: leaf.inspect, backlogItemId: ids.pbiOk } })
    await prisma.planActualsItemPbi.create({ data: { snapshotItemId: leaf.secret, backlogItemId: ids.pbiSecret } })
  })

  afterAll(async () => {
    if (!prisma) return
    await evals.settleQueuedBacktests().catch(() => undefined)
    await prisma.planEstimateEval.deleteMany({ where: { lineage } })
    await prisma.activityLog.deleteMany({ where: { projectId: ids.p } })
    await prisma.planActualsSnapshot.deleteMany({ where: { projectId: ids.p } })
    await prisma.productBacklogItem.deleteMany({ where: { projectId: ids.p } })
    await prisma.planItem.deleteMany({ where: { projectId: ids.p } })
    await prisma.projectMember.deleteMany({ where: { projectId: ids.p } })
    await prisma.project.deleteMany({ where: { id: ids.p } })
    await prisma.user.deleteMany({ where: { id: ids.u1 } })
  })

  const queue = () => prisma.planActualsReviewJob.create({ data: { projectId: ids.p, snapshotId } })
  const clear = async () => {
    await prisma.planActualsReviewProposal.deleteMany({ where: { projectId: ids.p } })
    await prisma.planActualsReviewJob.deleteMany({ where: { projectId: ids.p } })
    await prisma.planActualsItem.updateMany({ where: { snapshotId }, data: { learningUse: null } })
  }
  const answer = (data: Record<string, unknown>) =>
    JSON.stringify({
      proposals: [
        { iid: iidOf(data, "検査"), kind: "treat_as_waiting", quote: "部品の入荷待ち", confidence: "high" },
        { iid: iidOf(data, "設計"), kind: "exclude_from_learning", quote: "終了日の入力ミス", confidence: "medium" },
        { iid: iidOf(data, "設計"), kind: "treat_as_waiting", quote: "終了日の入力ミス", confidence: "low" },
        { iid: "i99", kind: "exclude_from_learning", quote: "SECRETNOTE", confidence: "high" },
      ],
    })

  it("confidential item never sent; proposals queued as pending with the quote; nothing about learning changes", async () => {
    const job = await queue()
    const before = await learn.learnableItemFacts(Object.values(leaf))
    const fake = fakeLlm(answer)
    const res = await batch.runActualsReviewBatch({ llm: fake.llm, config })
    expect(res.results).toEqual([{ jobId: job.id, outcome: "done", created: 2, dropped: 2 }])
    expect(fake.calls.map((c) => c.priority)).toEqual(["background"])
    const sent = fake.text()
    expect(sent).not.toContain("SECRETITEM")
    expect(sent).not.toContain("SECRETNOTE")
    expect(sent).not.toContain(ids.u1)
    expect(sent).toContain("部品の入荷待ちで 1 週間止まった")
    expect(sent).not.toContain("LIVEEDIT")
    expect(sent).toContain("全体として大きな問題は無かった。")
    const stored = await prisma.planActualsReviewJob.findUniqueOrThrow({ where: { id: job.id } })
    expect(stored).toMatchObject({ status: "done", proposalsCreated: 2, proposalsDropped: 2, llmModel: "fake-model", promptVersion: "e6r-v1", attempts: 1 })
    expect(stored.sourceIds.sort()).toEqual([`item:${leaf.design}`, `item:${leaf.inspect}`, `note:${snapshotId}`].sort())
    const list = await review.listReviewProposals(ids.p)
    expect(list.job).toBe("done")
    expect(list.proposals.map((p) => [p.itemName, p.kind, p.quote, p.quoteSource, p.confidence, p.state])).toEqual([
      ["検査", "treat_as_waiting", "部品の入荷待ち", "item", "high", "pending"],
      ["設計", "exclude_from_learning", "終了日の入力ミス", "item", "medium", "pending"],
    ])
    // Proposals alone change nothing.
    expect(await learn.learnableItemFacts(Object.values(leaf))).toEqual(before)
    expect(await prisma.planActualsItem.count({ where: { snapshotId, learningUse: { not: null } } })).toBe(0)
  })

  it("accept flips the switch, records who / when, audits, outdates the backtest; reject puts it back", async () => {
    const hash0 = await gate.lineageInputHash(lineage)
    await prisma.planEstimateEval.create({ data: { lineage, evaluatedOn: d("2026-10-20"), methodVersion: "e2-v1", n: 5, mape: 0.1, mapeTemplate: 0.4, p80Hit: 0.8, endErrorDays: 1, endErrorTemplateDays: 5, inputHash: hash0 } })
    const list = await review.listReviewProposals(ids.p)
    const waitP = list.proposals.find((p) => p.kind === "treat_as_waiting")!
    const exclP = list.proposals.find((p) => p.kind === "exclude_from_learning")!

    const accepted = await review.decideReviewProposal(ids.p, exclP.id, { decision: "accept", version: exclP.version }, po)
    expect(accepted).toMatchObject({ state: "accepted", decidedByName: "PO 太郎" })
    expect(accepted.decidedAt).not.toBeNull()
    expect((await prisma.planActualsItem.findUniqueOrThrow({ where: { id: leaf.design } })).learningUse).toBe("excluded")
    expect(await learn.learnableItemFacts([leaf.design])).toEqual([])
    expect(await learn.learnableItemIds({ lineage })).not.toContain(leaf.design)
    // The lineage's input hash moved: the recorded backtest no longer counts as current.
    const hash1 = await gate.lineageInputHash(lineage)
    expect(hash1).not.toBe(hash0)
    expect((await gate.latestEval(lineage))?.inputHash).not.toBe(hash1)
    // A stale version is refused.
    await expect(review.decideReviewProposal(ids.p, exclP.id, { decision: "reject", version: exclP.version }, po)).rejects.toMatchObject({ code: "PLAN_ACTUALS_CHANGED" })

    await review.decideReviewProposal(ids.p, waitP.id, { decision: "accept", version: waitP.version }, po)
    const [fact] = await learn.learnableItemFacts([leaf.inspect])
    // Learned as if the work took its planned 5 days; the 7-day overrun counts as waiting before it (1 + 7).
    expect(fact).toMatchObject({ actualDays: 5, waitGapDays: 8, learningUse: "waiting" })

    // Taking the exclusion back: the leaf is learned from again, and the decision is audited.
    const back = await review.decideReviewProposal(ids.p, exclP.id, { decision: "reject", version: accepted.version }, po)
    expect(back.state).toBe("rejected")
    expect((await prisma.planActualsItem.findUniqueOrThrow({ where: { id: leaf.design } })).learningUse).toBeNull()
    expect(await learn.learnableItemFacts([leaf.design])).toHaveLength(1)
    const audits = await prisma.activityLog.findMany({ where: { projectId: ids.p, diff: { contains: "planActualsReview" } }, orderBy: { createdAt: "asc" } })
    expect(audits).toHaveLength(3)
    expect(audits.every((a) => a.actorId === ids.u1)).toBe(true)
    expect(JSON.parse(audits[0].diff ?? "{}")).toMatchObject({ changes: { planActualsReview: { from: "pending", to: "accepted" }, planActualsLearningUse: { from: null, to: "excluded" } } })
  })

  it("reject keeps the leaf learnable; a proposal of a replaced snapshot can no longer be decided", async () => {
    await clear()
    await queue()
    await batch.runActualsReviewBatch({ llm: fakeLlm(answer).llm, config })
    const [first] = (await review.listReviewProposals(ids.p)).proposals
    const rejected = await review.decideReviewProposal(ids.p, first.id, { decision: "reject", version: first.version }, po)
    expect(rejected.state).toBe("rejected")
    expect(await prisma.planActualsItem.count({ where: { snapshotId, learningUse: { not: null } } })).toBe(0)
    expect(await prisma.activityLog.count({ where: { projectId: ids.p, diff: { contains: rejected.id } } })).toBe(1)
    // Another project's proposal id is "not found" (never decided across projects).
    await expect(review.decideReviewProposal(`${ids.p}-other`, first.id, { decision: "accept", version: rejected.version }, po)).rejects.toMatchObject({ code: "PLAN_ACTUALS_NOT_FOUND" })
    await prisma.planActualsSnapshot.update({ where: { id: snapshotId }, data: { supersededAt: new Date() } })
    try {
      await expect(review.decideReviewProposal(ids.p, first.id, { decision: "accept", version: rejected.version }, po)).rejects.toMatchObject({ code: "PLAN_ACTUALS_CHANGED" })
      expect(await review.listReviewProposals(ids.p)).toEqual({ snapshotId: null, job: "none", jobReason: null, capped: 0, proposals: [] })
    } finally {
      await prisma.planActualsSnapshot.update({ where: { id: snapshotId }, data: { supersededAt: null } })
    }
  })

  it("a leaf whose PBI becomes confidential: no proposal written, and an existing quote is no longer shown", async () => {
    await clear()
    await queue()
    const fake = fakeLlm(async (data) => {
      await prisma.productBacklogItem.update({ where: { id: ids.pbiOk }, data: { confidential: true } })
      return answer(data)
    })
    try {
      const res = await batch.runActualsReviewBatch({ llm: fake.llm, config })
      expect(res.results[0]).toMatchObject({ outcome: "done", created: 1 })
      expect(await prisma.planActualsReviewProposal.count({ where: { snapshotItemId: leaf.inspect } })).toBe(0)
      const p = await prisma.planActualsReviewProposal.create({ data: { projectId: ids.p, snapshotId, snapshotItemId: leaf.inspect, kind: "treat_as_waiting", quote: "部品の入荷待ち", confidence: "high" } })
      const shown = (await review.listReviewProposals(ids.p)).proposals.find((x) => x.id === p.id)
      // A placeholder: no name, no days, no quote (D-5 at display), only that a proposal exists and can be rejected.
      expect(shown).toMatchObject({ hidden: true, itemName: null, plannedDays: null, actualDays: null, quote: null, snapshotItemId: null })
      // No blind accept on a leaf nobody may read now; rejecting stays possible.
      await expect(review.decideReviewProposal(ids.p, p.id, { decision: "accept", version: 0 }, po)).rejects.toMatchObject({ code: "PLAN_ACTUALS_REVIEW_HIDDEN" })
      expect((await prisma.planActualsItem.findUniqueOrThrow({ where: { id: leaf.inspect } })).learningUse).toBeNull()
      expect((await review.decideReviewProposal(ids.p, p.id, { decision: "reject", version: 0 }, po)).state).toBe("rejected")
    } finally {
      await prisma.productBacklogItem.update({ where: { id: ids.pbiOk }, data: { confidential: false } })
    }
  })

  it("invalid twice → failed, nothing written; Ollama down → requeued, failed after the last night; assistance off → nothing sent", async () => {
    await clear()
    const job = await queue()
    const bad = fakeLlm(() => "Exclude all of them.")
    await batch.runActualsReviewBatch({ llm: bad.llm, config })
    expect(bad.calls).toHaveLength(2)
    expect(await prisma.planActualsReviewJob.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ status: "failed", lastError: "llm invalid" })
    expect(await prisma.planActualsReviewProposal.count({ where: { projectId: ids.p } })).toBe(0)

    await clear()
    const job2 = await queue()
    expect(await batch.runActualsReviewBatch({ llm: null, config })).toEqual({ results: [], recovered: 0 })
    expect((await prisma.planActualsReviewJob.findUniqueOrThrow({ where: { id: job2.id } })).status).toBe("queued")
    const down = fakeLlm(() => new errors.OllamaTimeoutError(1000))
    for (let night = 1; night <= batch.MAX_ATTEMPTS; night++) {
      const res = await batch.runActualsReviewBatch({ llm: down.llm, config })
      expect(res.results).toEqual([{ jobId: job2.id, outcome: night < batch.MAX_ATTEMPTS ? "requeued" : "failed", created: 0, dropped: 0, reason: "timeout" }])
    }
    expect(await prisma.planActualsReviewJob.findUniqueOrThrow({ where: { id: job2.id } })).toMatchObject({ status: "failed", attempts: batch.MAX_ATTEMPTS, lastError: "llm timeout" })
    await clear()
  })

  it("concurrent decides of one proposal: exactly one wins, the other is refused (version)", async () => {
    await clear()
    await queue()
    await batch.runActualsReviewBatch({ llm: fakeLlm(answer).llm, config })
    const p = (await review.listReviewProposals(ids.p)).proposals.find((x) => x.kind === "exclude_from_learning")!
    const res = await Promise.allSettled([review.decideReviewProposal(ids.p, p.id!, { decision: "accept", version: p.version }, po), review.decideReviewProposal(ids.p, p.id!, { decision: "reject", version: p.version }, po)])
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1)
    expect(res.find((r) => r.status === "rejected")).toMatchObject({ reason: { code: "PLAN_ACTUALS_CHANGED" } })
    const row = await prisma.planActualsReviewProposal.findUniqueOrThrow({ where: { id: p.id! } })
    const use = (await prisma.planActualsItem.findUniqueOrThrow({ where: { id: leaf.design } })).learningUse
    expect(use).toBe(row.state === "accepted" ? "excluded" : null)
    expect(await prisma.activityLog.count({ where: { projectId: ids.p, diff: { contains: p.id! } } })).toBe(1)
    await clear()
  })

  it("a snapshot replaced while the model answers gets no proposals; pending ones of a replaced snapshot are superseded and do not count against the cap", async () => {
    await clear()
    const old = await prisma.planActualsSnapshot.create({ data: { projectId: ids.p, projectType: "x", lineage: `${tag}-old`, closedAt: d("2025-01-01"), firstFinalizedAt: d("2025-01-02"), finalizedAt: d("2025-01-02"), methodVersion: "e1-v1", supersededAt: d("2025-02-01") } })
    for (let i = 0; i < batch.PENDING_PER_PROJECT_MAX; i++) {
      const it = await prisma.planActualsItem.create({ data: { snapshotId: old.id, planItemId: "", name: `o${i}`, complete: true } })
      await prisma.planActualsReviewProposal.create({ data: { projectId: ids.p, snapshotId: old.id, snapshotItemId: it.id, kind: "exclude_from_learning", quote: "xxxx", confidence: "low" } })
    }
    await queue()
    const res = await batch.runActualsReviewBatch({ llm: fakeLlm(answer).llm, config })
    expect(res.results[0]).toMatchObject({ outcome: "done", created: 2 })
    expect(await prisma.planActualsReviewProposal.count({ where: { snapshotId: old.id, state: "pending" } })).toBe(0)
    expect(await prisma.planActualsReviewProposal.count({ where: { snapshotId: old.id, state: "superseded" } })).toBe(batch.PENDING_PER_PROJECT_MAX)
    await prisma.planActualsSnapshot.delete({ where: { id: old.id } })

    await clear()
    const job = await queue()
    const racing = fakeLlm(async (data) => {
      await prisma.planActualsSnapshot.update({ where: { id: snapshotId }, data: { supersededAt: new Date() } })
      return answer(data)
    })
    try {
      const r = await batch.runActualsReviewBatch({ llm: racing.llm, config })
      expect(r.results).toEqual([{ jobId: job.id, outcome: "skipped", created: 0, dropped: 0, reason: "superseded" }])
      expect(await prisma.planActualsReviewProposal.count({ where: { snapshotId } })).toBe(0)
    } finally {
      await prisma.planActualsSnapshot.update({ where: { id: snapshotId }, data: { supersededAt: null } })
      await clear()
    }
  })

  it("the cap is shown: valid proposals refused by it are counted on the job; pending proposals expire after 90 days", async () => {
    await clear()
    // The current snapshot already holds the most pending proposals (synthetic leaves that are not sent).
    const extra: string[] = []
    for (let i = 0; i < batch.PENDING_PER_PROJECT_MAX; i++) {
      const it = await prisma.planActualsItem.create({ data: { snapshotId, planItemId: "", name: `c${i}`, complete: false } })
      extra.push(it.id)
      await prisma.planActualsReviewProposal.create({ data: { projectId: ids.p, snapshotId, snapshotItemId: it.id, kind: "exclude_from_learning", quote: "xxxx", confidence: "low" } })
    }
    await queue()
    const r = await batch.runActualsReviewBatch({ llm: fakeLlm(answer).llm, config })
    expect(r.results[0]).toMatchObject({ outcome: "done", created: 0 })
    const list = await review.listReviewProposals(ids.p)
    expect(list.capped).toBe(2)
    // Ninety days later the pending ones expire (the next batch), freeing the cap.
    await prisma.planActualsReviewProposal.updateMany({ where: { snapshotItemId: { in: extra } }, data: { createdAt: new Date(Date.now() - 91 * 86_400_000) } })
    await batch.runActualsReviewBatch({ llm: fakeLlm(answer).llm, config })
    expect(await prisma.planActualsReviewProposal.count({ where: { snapshotItemId: { in: extra }, state: "expired" } })).toBe(batch.PENDING_PER_PROJECT_MAX)
    await prisma.planActualsItem.deleteMany({ where: { id: { in: extra } } })
    await clear()
  })
})
