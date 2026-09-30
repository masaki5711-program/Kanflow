import { describe, expect, it } from "vitest"
import { activeJobKey, aiJobsEnabled, decideWebJobRunner, isActiveStatus, resolveAiJobRunner, workerRunsAiJobs } from "../config"

describe("resolveAiJobRunner", () => {
  it("follows AI_TRANSLATION_WORKER by default", () => {
    expect(resolveAiJobRunner({})).toBe("worker")
    expect(resolveAiJobRunner({ AI_TRANSLATION_WORKER: "external" })).toBe("worker")
    expect(resolveAiJobRunner({ AI_TRANSLATION_WORKER: "inprocess" })).toBe("web")
    expect(resolveAiJobRunner({ AI_TRANSLATION_WORKER: "true" })).toBe("web")
    expect(resolveAiJobRunner({ AI_TRANSLATION_WORKER: "off" })).toBe("off")
  })

  it("AI_JOB_RUNNER overrides; unknown values mean auto", () => {
    expect(resolveAiJobRunner({ AI_JOB_RUNNER: "web", AI_TRANSLATION_WORKER: "external" })).toBe("web")
    expect(resolveAiJobRunner({ AI_JOB_RUNNER: "worker", AI_TRANSLATION_WORKER: "off" })).toBe("worker")
    expect(resolveAiJobRunner({ AI_JOB_RUNNER: "off" })).toBe("off")
    expect(resolveAiJobRunner({ AI_JOB_RUNNER: "banana", AI_TRANSLATION_WORKER: "inprocess" })).toBe("web")
  })

  it("enabled unless off; worker vs web decisions", () => {
    expect(aiJobsEnabled({ AI_JOB_RUNNER: "off" })).toBe(false)
    expect(aiJobsEnabled({})).toBe(true)
    expect(workerRunsAiJobs({})).toBe(true)
    expect(workerRunsAiJobs({ AI_TRANSLATION_WORKER: "inprocess" })).toBe(false)
  })
})

describe("decideWebJobRunner", () => {
  it("starts only in web mode, and in next dev only with the dev opt-in", () => {
    expect(decideWebJobRunner({}).start).toBe(false)
    expect(decideWebJobRunner({ AI_TRANSLATION_WORKER: "inprocess", NODE_ENV: "production" }).start).toBe(true)
    expect(decideWebJobRunner({ AI_TRANSLATION_WORKER: "inprocess", NODE_ENV: "development" }).start).toBe(false)
    expect(
      decideWebJobRunner({ AI_TRANSLATION_WORKER: "inprocess", NODE_ENV: "development", AI_TRANSLATION_WORKER_IN_DEV: "true" }).start
    ).toBe(true)
  })
})

describe("helpers", () => {
  it("activeJobKey scopes by project, kind and optional scope", () => {
    expect(activeJobKey("p1", "progress_report")).toBe("p1:progress_report")
    expect(activeJobKey("p1", "sprint_review", "s9")).toBe("p1:sprint_review:s9")
  })

  it("isActiveStatus", () => {
    expect(isActiveStatus("queued")).toBe(true)
    expect(isActiveStatus("running")).toBe(true)
    expect(isActiveStatus("done")).toBe(false)
  })
})
