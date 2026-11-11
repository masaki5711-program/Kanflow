import { describe, expect, it } from "vitest"
import { screen } from "@testing-library/react"
import { getTranslations } from "@/lib/i18n"
import { ja as jaMerge } from "@/lib/i18n/git-merge-state"
import { renderWithProviders } from "@/components/__tests__/helpers"
import { GitCardBadge } from "../git-card-badge"
import { toMergeState, toPanel, type GitMergeStateDto } from "../git-client-state"
import { MergeState } from "../merge-state"
import { blockerView, conflictView, parseDetail } from "../merge-state-model"

const ja = getTranslations("ja")
const en = getTranslations("en")

/** GitStation's 18 reason names (docs/api/merge-status.md, synthetic tests). */
const NAMES = [
  "not_open", "draft", "merge_in_progress", "source_branch_missing", "mergeability_unknown", "conflict", "ff_not_possible",
  "nothing_to_merge", "approvals_missing", "codeowner_approval_missing", "codeowners_invalid", "required_check_missing",
  "required_check_stale", "required_check_not_successful", "unresolved_discussions", "work_item_link_missing",
  "config_change_needs_maintainer_approval", "changed_paths_unknown",
]

const state = (over: Partial<GitMergeStateDto> = {}): GitMergeStateDto => ({
  mergeable: false,
  blockers: [],
  conflicts: { status: "scanned", stale: false, scannedAt: "2026-10-01T00:00:00.000Z", peers: [] },
  checkedAt: new Date().toISOString(),
  ...over,
})

describe("N4: reasons in the viewer's words", () => {
  it("gives every GitStation reason its own label in ja / en / id, never the raw name", () => {
    for (const lang of ["ja", "en", "id"] as const) {
      const t = getTranslations(lang)
      const labels = NAMES.map((reason) => blockerView({ reason, detail: null }, t).label)
      expect(new Set(labels).size).toBe(NAMES.length)
      for (const [i, label] of labels.entries()) expect(label).not.toContain(NAMES[i])
    }
  })

  it("says who acts next; states without a step (closed, branch gone, nothing to merge) have none", () => {
    expect(blockerView({ reason: "draft", detail: null }, ja).next).toBe("作者が下書きを解除する")
    expect(blockerView({ reason: "conflict", detail: null }, ja).next).toBe(blockerView({ reason: "ff_not_possible", detail: null }, ja).next)
    for (const reason of ["not_open", "source_branch_missing", "nothing_to_merge"]) expect(blockerView({ reason, detail: null }, ja).next).toBeNull()
  })

  it("an unknown reason is shown as blocked with its name, and points to GitStation", () => {
    expect(blockerView({ reason: "future_reason", detail: null }, en)).toMatchObject({ label: "Blocked (future_reason)", next: "Check it in GitStation" })
  })

  it("shows a few facts from the detail: approvals m/n, the check, the open discussions", () => {
    expect(blockerView({ reason: "approvals_missing", detail: "rule=Two reviewers required=2 counted=1" }, ja).fact).toBe("承認 1/2")
    expect(blockerView({ reason: "required_check_not_successful", detail: "name=ci/build status=completed conclusion=failure" }, en).fact).toBe("check ci/build")
    expect(blockerView({ reason: "unresolved_discussions", detail: "count=3" }, en).fact).toBe("3 open")
    expect(blockerView({ reason: "draft", detail: null }, ja).fact).toBeNull()
  })

  it("waiting for kanflow/acceptance points to Kanflow's own acceptance, not to the author", () => {
    expect(blockerView({ reason: "required_check_missing", detail: "name=kanflow/acceptance" }, ja).next).toBe("Kanflow で受け入れ条件を整える（スプリント・受け入れ）")
  })

  it("parseDetail splits key=value pairs, a value running to the next key (rule names have spaces)", () => {
    expect(parseDetail("rule=Two reviewers required=2 counted=1")).toEqual({ rule: "Two reviewers", required: "2", counted: "1" })
    expect(parseDetail(null)).toEqual({})
    expect(parseDetail("no pairs here")).toEqual({})
  })
})

describe("N5: predicted conflicts in the viewer's words", () => {
  const scan = (over: Partial<NonNullable<GitMergeStateDto["conflicts"]>> = {}) => ({ status: "scanned", stale: false, scannedAt: null, peers: [], ...over })

  it("lists conflicts first (with how many files), then trial merges that could not run", () => {
    const view = conflictView(
      scan({ peers: [
        { iid: 9, draft: false, outcome: "failed", files: 0, truncated: false },
        { iid: 12, draft: true, outcome: "conflict", files: 100, truncated: true },
        { iid: 4, draft: false, outcome: "conflict", files: 3, truncated: false },
      ] }),
      ja,
    )!
    expect(view.peers.map((p) => p.text)).toEqual(["!4 と 3 ファイル", "!12 と 100 ファイル以上（下書き）", "!9 とは試しのマージができなかった"])
    expect(view.note).toBeNull()
  })

  it("English reads naturally, singular included", () => {
    const view = conflictView(scan({ peers: [{ iid: 4, draft: false, outcome: "conflict", files: 1, truncated: false }, { iid: 5, draft: true, outcome: "conflict", files: 2, truncated: false }] }), en)!
    expect(view.peers.map((p) => p.text)).toEqual(["1 file in conflict with !4", "2 files in conflict with !5 (draft)"])
  })

  it("only a finished scan with no peer says none were found; anything else is not a 'no'", () => {
    expect(conflictView(scan(), ja)!.note).toBe("none")
    for (const status of ["pending", "scanning", "none", "failed", "something_new"]) expect(conflictView(scan({ status }), ja)!.note).toBe("unchecked")
    expect(conflictView(scan({ status: "incomplete" }), ja)!.note).toBe("partial")
    expect(conflictView(null, ja)).toBeNull()
  })
})

describe("N4 / N5: parsing what the API sends", () => {
  it("toMergeState drops anything malformed and never throws", () => {
    expect(toMergeState(null)).toBeNull()
    expect(toMergeState({ blockers: [] })).toBeNull()
    const parsed = toMergeState({
      mergeable: "yes",
      checkedAt: "2026-10-01T00:00:00.000Z",
      blockers: [{ reason: "draft", detail: null }, { reason: 7 }, "x", { reason: "" }],
      conflicts: { status: "scanned", peers: [{ iid: 3, outcome: "conflict", files: -1 }, { iid: "x" }] },
    })
    expect(parsed).toEqual({
      mergeable: null,
      checkedAt: "2026-10-01T00:00:00.000Z",
      blockers: [{ reason: "draft", detail: null }],
      conflicts: { status: "scanned", stale: false, scannedAt: null, peers: [{ iid: 3, draft: false, outcome: "conflict", files: 0, truncated: false }] },
    })
  })

  it("a panel link carries its merge state through toPanel", () => {
    const panel = toPanel({ enabled: true, links: [{ id: "l1", kind: "mr", url: "https://x", occurredAt: "2026-10-01T00:00:00.000Z", repository: { id: "r", name: "web" }, merge: state({ blockers: [{ reason: "draft", detail: null }] }) }] })
    expect(panel.links?.[0].merge?.blockers).toEqual([{ reason: "draft", detail: null }])
  })
})

describe("MergeState (the 開発 panel)", () => {
  it("lists what blocks the merge with the next step, and the predicted conflicts", () => {
    renderWithProviders(
      <MergeState merge={state({
        blockers: [{ reason: "approvals_missing", detail: "rule=default required=2 counted=1" }, { reason: "draft", detail: null }],
        conflicts: { status: "scanned", stale: true, scannedAt: null, peers: [{ iid: 12, draft: true, outcome: "conflict", files: 3, truncated: false }] },
      })} />,
      "ja",
    )
    expect(screen.getByRole("group", { name: jaMerge.gitMergeBlockedTitle })).toBeInTheDocument()
    expect(screen.getByText("承認が足りない")).toBeInTheDocument()
    expect(screen.getByText("（承認 1/2）")).toBeInTheDocument()
    expect(screen.getByText("次: 承認できる人が承認する")).toBeInTheDocument()
    expect(screen.getByText("!12 と 3 ファイル（下書き）")).toBeInTheDocument()
    expect(screen.getByText("前の版で確かめた結果です")).toBeInTheDocument()
    // The caveat is visible text, not a tooltip.
    expect(screen.getByText(jaMerge.gitConflictNote)).toBeInTheDocument()
    expect(document.querySelector("[title]:not(time)")).toBeNull()
    expect(screen.queryByText("マージできる状態です")).toBeNull()
  })

  it("an unknown reason shows GitStation's detail as text (the only thing that explains it); a known one does not", () => {
    renderWithProviders(<MergeState merge={state({ blockers: [{ reason: "future_reason", detail: "why=something new" }, { reason: "draft", detail: "ignored" }] })} />, "en")
    expect(screen.getByText("Blocked (future_reason)")).toBeInTheDocument()
    expect(screen.getByText("why=something new")).toBeInTheDocument()
    expect(screen.queryByText("ignored")).toBeNull()
    expect(screen.getByText("Next: Check it in GitStation")).toBeInTheDocument()
  })

  it("says it is ready to merge when GitStation says so and nothing blocks it (English)", () => {
    renderWithProviders(<MergeState merge={state({ mergeable: true })} />, "en")
    expect(screen.getByText("Ready to merge")).toBeInTheDocument()
    expect(screen.getByText("No conflict with other MRs is predicted")).toBeInTheDocument()
    expect(screen.queryByRole("group", { name: "What blocks the merge" })).toBeNull()
    expect(document.querySelector("[data-git-blocker]")).toBeNull()
  })

  it("never claims 'no conflict' when the prediction was not read", () => {
    renderWithProviders(<MergeState merge={state({ mergeable: true, conflicts: null })} />, "ja")
    expect(screen.queryByText("ほかの MR との衝突は予測されていません")).toBeNull()
    expect(document.querySelector("[data-git-conflicts]")).toBeNull()
  })
})

describe("GitCardBadge (N4 / N5 marks)", () => {
  const summary = { openMrs: 2, mergedMrs: 0, branches: 0, pipeline: null, blockedMrs: 1, conflictMrs: 2 }

  it("marks blocked MRs and predicted conflicts, with words in the tooltip and for screen readers", () => {
    renderWithProviders(<GitCardBadge summary={summary} />, "ja")
    const badge = document.querySelector("[data-git-badge]") as HTMLElement
    expect(badge.querySelector("[data-git-badge-blocked]")).not.toBeNull()
    expect(badge.querySelector("[data-git-badge-conflicts]")).not.toBeNull()
    expect(badge.getAttribute("title")).toContain("1 件の MR がマージを止められている")
    expect(badge.getAttribute("title")).toContain("2 件の MR に衝突の予測")
    expect(screen.getByText(/1 件の MR がマージを止められている/)).toHaveClass("sr-only")
  })

  it("English says '1 MR', not '1 MRs'", () => {
    renderWithProviders(<GitCardBadge summary={{ ...summary, blockedMrs: 1, conflictMrs: 1 }} />, "en")
    const title = (document.querySelector("[data-git-badge]") as HTMLElement).getAttribute("title") ?? ""
    expect(title).toContain("1 MR blocked from merging")
    expect(title).toContain("1 MR with predicted conflicts")
  })

  it("shows no mark when nothing is blocked or predicted", () => {
    renderWithProviders(<GitCardBadge summary={{ ...summary, blockedMrs: 0, conflictMrs: 0 }} />, "en")
    const badge = document.querySelector("[data-git-badge]") as HTMLElement
    expect(badge.querySelector("[data-git-badge-blocked]")).toBeNull()
    expect(badge.querySelector("[data-git-badge-conflicts]")).toBeNull()
  })
})
