import { describe, expect, it, vi } from "vitest"
import { applyMistakeImport, planMistakeImport } from "../feedback.import"

const NOW = new Date("2026-11-01T10:00:00.000Z")
const rec = (over: Record<string, unknown>) =>
  JSON.stringify({ id: "mk-1", title: "Bash backticks get substituted", signature: "unexpected EOF while looking for matching; command not found", root_cause: "backticks in node -e", fix: "Write files with the Write tool", recurrence: 2, last_hit_at: "2026-10-30T00:00:00.000Z", ...over })
const plan = (...lines: string[]) => planMistakeImport(lines.join("\n"), "x/records.jsonl", NOW, { allowedHosts: [] })

describe("planMistakeImport", () => {
  it("one confirmed-candidate lesson per record, global scope, evidence = the record id and file", () => {
    const p = plan(rec({}))
    expect(p.skipped).toEqual([])
    expect(p.lessons).toHaveLength(1)
    expect(p.lessons[0]).toMatchObject({
      scope: "global",
      symptom: "Bash backticks get substituted",
      cause: "backticks in node -e",
      fix: "Write files with the Write tool",
      hits: 2,
      sourceId: "mk-1",
      evidence: ["mistake-memory:mk-1 (x/records.jsonl)"],
    })
    expect(p.lessons[0].signature).toMatch(/^[0-9a-f]{64}$/)
    expect(p.lessons[0].lastSeenAt.toISOString()).toBe("2026-10-30T00:00:00.000Z")
  })

  it("the signature is stable: the same record twice (or on a re-run) has the same key", () => {
    expect(plan(rec({})).lessons[0].signature).toBe(plan(rec({ id: "mk-9", title: "other title" })).lessons[0].signature)
  })

  it("skips with a reason: no fix, no signature text, duplicate in the file, invalid JSON, a credential left", () => {
    const p = plan(
      rec({ id: "a", fix: "" }),
      rec({ id: "b", signature: "", title: "" }),
      rec({ id: "c", signature: "same text here" }),
      rec({ id: "d", signature: "same text here" }),
      "{not json",
      rec({ id: "e", signature: "another one", fix: "run with password=correcthorse" }),
    )
    expect(p.lessons.map((l) => l.sourceId)).toEqual(["c"])
    expect(p.skipped.map((s) => [s.id, s.reason])).toEqual([
      ["a", "no-fix"],
      ["b", "no-signature-text"],
      ["d", "duplicate-in-file"],
      [null, "invalid-json"],
      ["e", "residual-secret"],
    ])
  })

  it("redacts secrets in the text it keeps", () => {
    const p = plan(rec({ fix: "ask bob@corp.example.com, token kfl_AbCdEfGhIjKlMnOpQrStUv0123456789" }))
    expect(p.lessons[0].fix).not.toContain("bob@")
    expect(p.lessons[0].fix).not.toContain("kfl_")
  })

  it("ignores blank lines", () => {
    expect(plan("", rec({}), "  ").lessons).toHaveLength(1)
  })
})

describe("applyMistakeImport: idempotent", () => {
  function fakeDb(existing: Set<string>) {
    return {
      lesson: {
        findUnique: vi.fn(async ({ where }: { where: { signature_scope: { signature: string } } }) => (existing.has(where.signature_scope.signature) ? { id: "x" } : null)),
        create: vi.fn(async ({ data }: { data: { signature: string } }) => {
          existing.add(data.signature)
          return { id: "new" }
        }),
      },
    }
  }

  it("creates confirmed global lessons once; the second run changes nothing", async () => {
    const existing = new Set<string>()
    const db = fakeDb(existing)
    const p = plan(rec({ id: "a", signature: "first failure text" }), rec({ id: "b", signature: "second failure text" }))
    expect(await applyMistakeImport(db as never, p, NOW)).toEqual({ created: 2, existing: 0 })
    expect(db.lesson.create.mock.calls[0][0].data).toMatchObject({ state: "confirmed", scope: "global", confirmedAt: NOW, hits: 2 })
    expect(await applyMistakeImport(db as never, p, NOW)).toEqual({ created: 0, existing: 2 })
    expect(db.lesson.create).toHaveBeenCalledTimes(2)
  })

  it("a lesson curated since (already present) is left alone", async () => {
    const p = plan(rec({}))
    const db = fakeDb(new Set([p.lessons[0].signature]))
    expect(await applyMistakeImport(db as never, p, NOW)).toEqual({ created: 0, existing: 1 })
  })
})
