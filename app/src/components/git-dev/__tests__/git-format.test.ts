import { describe, expect, it } from "vitest"
import { getTranslations } from "@/lib/i18n"
import { badgeLabel, groupByRepository, hasGitActivity, mrStateInfo, pipelineInfo } from "../git-format"
import { toPanel, toSummaries } from "../git-client-state"
import { link, REPO_API, REPO_WEB } from "./fixtures"

const ja = getTranslations("ja")

describe("git-format", () => {
  it("maps MR states (locked counts as open)", () => {
    expect(mrStateInfo("opened", ja)).toMatchObject({ tone: "primary", label: "オープン" })
    expect(mrStateInfo("locked", ja).label).toBe("オープン")
    expect(mrStateInfo("merged", ja)).toMatchObject({ tone: "success", label: "マージ済み" })
    expect(mrStateInfo("closed", ja)).toMatchObject({ tone: "neutral", label: "クローズ" })
  })

  it("maps pipeline statuses to tones and keeps unknown words", () => {
    expect(pipelineInfo("failed", ja)).toMatchObject({ tone: "danger", label: "失敗" })
    expect(pipelineInfo("running", ja).tone).toBe("warning")
    expect(pipelineInfo("waiting_for_resource", ja)).toMatchObject({ tone: "warning", label: "待機中" })
    expect(pipelineInfo("success", ja).tone).toBe("success")
    expect(pipelineInfo("weird", ja)).toMatchObject({ tone: "neutral", label: "weird" })
  })

  it("groups by repository, most recently active first", () => {
    const groups = groupByRepository([
      link({ kind: "branch", repository: REPO_WEB, occurredAt: "2026-09-01T00:00:00Z" }),
      link({ kind: "commit", repository: REPO_API, occurredAt: "2026-10-01T00:00:00Z" }),
      link({ kind: "commit", repository: REPO_WEB, occurredAt: "2026-09-02T00:00:00Z" }),
    ])
    expect(groups.map((g) => [g.repository.name, g.mrs.length, g.branches.length, g.commits.length])).toEqual([
      ["api-server", 0, 0, 1],
      ["web-frontend", 0, 1, 1],
    ])
  })

  it("badge text and activity check", () => {
    expect(hasGitActivity(undefined)).toBe(false)
    expect(hasGitActivity({ openMrs: 0, mergedMrs: 0, branches: 0, pipeline: "success" })).toBe(false)
    expect(badgeLabel({ openMrs: 2, mergedMrs: 0, branches: 0, pipeline: "failed" }, ja)).toBe("マージリクエスト 2 件オープン、パイプライン: 失敗")
    expect(badgeLabel({ openMrs: 0, mergedMrs: 0, branches: 1, pipeline: null }, ja)).toBe("ブランチ 1 件")
  })

  it("parses responses defensively", () => {
    expect(toPanel(null)).toEqual({ enabled: false })
    expect(toPanel({ enabled: true, links: [{ id: "x" }, link({ kind: "mr" })] }).links).toHaveLength(1)
    expect(toPanel({ enabled: true, links: [link({ kind: "branch", goneAt: "2026-10-02T00:00:00.000Z" }), { ...link({ kind: "branch" }), goneAt: 5 }] }).links!.map((l) => l.goneAt)).toEqual([
      "2026-10-02T00:00:00.000Z",
      null,
    ])
    expect(toSummaries({ enabled: true, summaries: { a: { openMrs: "2" }, b: null } })).toEqual({
      enabled: true,
      summaries: { a: { openMrs: 0, mergedMrs: 0, branches: 0, pipeline: null } },
    })
    expect(toSummaries({ error: "x" })).toEqual({ enabled: false, summaries: {} })
  })
})
