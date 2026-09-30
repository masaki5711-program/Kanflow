import { describe, expect, it } from "vitest"
import { getTranslations } from "@/lib/i18n"
import { describeJobStatus, isJobActive, isJobsDisabledError, jobUrl, toJobList } from "./ai-job-client"

const t = getTranslations("en")

describe("ai-job-client", () => {
  it("describes each status with a tone", () => {
    expect(describeJobStatus({ status: "queued", progress: null }, t)).toEqual({ label: "Queued", tone: "neutral" })
    expect(describeJobStatus({ status: "running", progress: 0 }, t)).toEqual({ label: "Generating", tone: "primary" })
    expect(describeJobStatus({ status: "running", progress: 55 }, t).label).toBe("Generating 55%")
    expect(describeJobStatus({ status: "done", progress: 100 }, t).tone).toBe("success")
    expect(describeJobStatus({ status: "failed", progress: null }, t).tone).toBe("danger")
    expect(describeJobStatus({ status: "cancelled", progress: null }, t).label).toBe("Cancelled")
  })

  it("recognizes the jobs-disabled 503 only", () => {
    expect(isJobsDisabledError({ status: 503, body: { reason: "ai_jobs_disabled" } })).toBe(true)
    expect(isJobsDisabledError({ status: 503, body: { reason: "other" } })).toBe(false)
    expect(isJobsDisabledError({ status: 500 })).toBe(false)
    expect(isJobsDisabledError(null)).toBe(false)
  })

  it("filters malformed list items and knows active states", () => {
    expect(toJobList({ items: [{ id: "j", kind: "progress_report", status: "queued" }, { id: "r", status: "done" }] })).toHaveLength(1)
    expect(toJobList([])).toEqual([])
    expect(isJobActive({ status: "running" })).toBe(true)
    expect(isJobActive(null)).toBe(false)
    expect(jobUrl("p 1", "j/1")).toBe("/api/projects/p%201/ai/jobs/j%2F1")
  })
})
