import { describe, expect, it } from "vitest"
import { parseSubmittedReport, SUBMIT_REPORT_TOOL, type StructuredReport } from "@/lib/report-tool"
import { structuredReportToMarkdown } from "@/lib/report-markdown"

describe("parseSubmittedReport", () => {
  it("requires non-empty headline and overview", () => {
    expect(parseSubmittedReport({})).toEqual({
      ok: false,
      error: "missing required fields: 'headline' and 'overview' must both be non-empty strings",
    })
    expect(parseSubmittedReport({ headline: "  ", overview: "x" }).ok).toBe(false)
    expect(parseSubmittedReport({ headline: { a: 1 }, overview: "x" }).ok).toBe(false)
  })

  it("normalizes a minimal report with empty collections", () => {
    const r = parseSubmittedReport({ headline: " H ", overview: 42 })
    expect(r).toEqual({
      ok: true,
      report: {
        headline: "H",
        overview: "42",
        followUps: [],
        findings: [],
        metrics: [],
        causes: [],
        actions: [],
        outlook: null,
      },
    })
  })

  it("coerces sloppy entries leniently and drops empty ones", () => {
    const r = parseSubmittedReport({
      headline: "h",
      overview: "o",
      followUps: [
        { status: "RESOLVED", item: "a", note: "n" },
        { status: "weird", item: "b" },
        { status: "improved", item: "" },
      ],
      findings: [
        { severity: "Critical", title: "t1", detail: "d" },
        { severity: 3, title: "t2" },
        { severity: "info", title: "" },
      ],
      metrics: [{ label: "SP", value: 5 }, { label: "", value: "x" }, { label: "y", value: "" }],
      causes: ["c1", "", 7, null],
      actions: [{ priority: "HIGH", action: "do" }, { priority: "urgent", action: "later" }, { priority: "low", action: "" }],
      outlook: "  soon ",
    })
    if (!r.ok) throw new Error("expected ok")
    expect(r.report.followUps).toEqual([
      { status: "resolved", item: "a", note: "n" },
      { status: "unresolved", item: "b", note: null },
    ])
    expect(r.report.findings).toEqual([
      { severity: "critical", title: "t1", detail: "d" },
      { severity: "info", title: "t2", detail: null },
    ])
    expect(r.report.metrics).toEqual([{ label: "SP", value: "5" }])
    expect(r.report.causes).toEqual(["c1", "7"])
    expect(r.report.actions).toEqual([
      { priority: "high", action: "do" },
      { priority: "medium", action: "later" },
    ])
    expect(r.report.outlook).toBe("soon")
  })

  it("treats non-array collections as empty and caps sizes/lengths", () => {
    const r = parseSubmittedReport({
      headline: "h".repeat(400),
      overview: "o".repeat(3000),
      findings: "not an array",
      causes: Array.from({ length: 10 }, (_, i) => `c${i}`),
      metrics: Array.from({ length: 20 }, (_, i) => ({ label: `l${i}`, value: "v" })),
      actions: Array.from({ length: 9 }, () => ({ priority: "low", action: "a".repeat(400) })),
    })
    if (!r.ok) throw new Error("expected ok")
    expect(r.report.headline).toHaveLength(300)
    expect(r.report.overview).toHaveLength(2000)
    expect(r.report.findings).toEqual([])
    expect(r.report.causes).toHaveLength(6)
    expect(r.report.metrics).toHaveLength(12)
    expect(r.report.actions).toHaveLength(6)
    expect(r.report.actions[0].action).toHaveLength(300)
  })

  it("declares a submit_report tool with required headline/overview", () => {
    expect(SUBMIT_REPORT_TOOL.function.name).toBe("submit_report")
    expect(SUBMIT_REPORT_TOOL.function.parameters.required).toEqual(["headline", "overview"])
  })
})

describe("structuredReportToMarkdown", () => {
  const full: StructuredReport = {
    headline: "Sprint at risk",
    overview: "Behind plan.",
    followUps: [
      { status: "resolved", item: "old issue", note: "fixed" },
      { status: "unresolved", item: "other", note: null },
    ],
    findings: [
      { severity: "critical", title: "Stalled", detail: "3 tasks" },
      { severity: "info", title: "Ok", detail: null },
    ],
    metrics: [{ label: "SP", value: "5/13" }],
    causes: ["Scope creep"],
    actions: [{ priority: "high", action: "Cut scope" }],
    outlook: "Watch burndown",
  }

  it("renders every section in English", () => {
    const md = structuredReportToMarkdown(full, "en")
    expect(md).toBe(
      [
        "**Sprint at risk**",
        "",
        "## Overview",
        "Behind plan.",
        "",
        "## Follow-up on previous findings",
        "- ✅ old issue — fixed",
        "- ❌ other",
        "",
        "## Findings",
        "- 🔴 **Stalled** — 3 tasks",
        "- 🟢 **Ok**",
        "",
        "## Key metrics",
        "| Item | Value |",
        "| --- | --- |",
        "| SP | 5/13 |",
        "",
        "## Cause analysis",
        "- Scope creep",
        "",
        "## Recommended actions",
        "- ⚡ Cut scope",
        "",
        "## Outlook",
        "Watch burndown",
      ].join("\n")
    )
  })

  it("omits empty sections and localizes headings", () => {
    const minimal: StructuredReport = {
      headline: "H",
      overview: "O",
      followUps: undefined as unknown as StructuredReport["followUps"],
      findings: [],
      metrics: [],
      causes: [],
      actions: [],
      outlook: null,
    }
    expect(structuredReportToMarkdown(minimal, "ja")).toBe("**H**\n\n## 概要\nO")
    expect(structuredReportToMarkdown(minimal, "id")).toContain("## Ringkasan")
    expect(structuredReportToMarkdown({ ...full, followUps: [{ status: "improved", item: "x", note: null }] }, "ja")).toContain("- 🔼 x")
  })
})
