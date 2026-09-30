import { describe, expect, test } from "vitest"
import { decideInProcessWorker, describeWorkerLocation, parseWorkerMode } from "../worker-mode"

describe("parseWorkerMode", () => {
  test("default and unknown values are external", () => {
    expect(parseWorkerMode(undefined)).toBe("external")
    expect(parseWorkerMode("")).toBe("external")
    expect(parseWorkerMode("external")).toBe("external")
    expect(parseWorkerMode("typo")).toBe("external")
  })

  test("inprocess and legacy true", () => {
    expect(parseWorkerMode("inprocess")).toBe("inprocess")
    expect(parseWorkerMode("InProcess")).toBe("inprocess")
    expect(parseWorkerMode("true")).toBe("inprocess")
  })

  test("off and legacy false", () => {
    expect(parseWorkerMode("off")).toBe("off")
    expect(parseWorkerMode("false")).toBe("off")
  })
})

describe("decideInProcessWorker", () => {
  test("production default does not start the loop in the web process", () => {
    expect(decideInProcessWorker({ NODE_ENV: "production" })).toMatchObject({ start: false, mode: "external" })
  })

  test("inprocess starts it in production", () => {
    expect(decideInProcessWorker({ NODE_ENV: "production", AI_TRANSLATION_WORKER: "inprocess" })).toMatchObject({ start: true })
  })

  test("next dev never starts it unless explicitly asked", () => {
    expect(decideInProcessWorker({ NODE_ENV: "development", AI_TRANSLATION_WORKER: "inprocess" }).start).toBe(false)
    expect(
      decideInProcessWorker({ NODE_ENV: "development", AI_TRANSLATION_WORKER: "inprocess", AI_TRANSLATION_WORKER_IN_DEV: "true" }).start
    ).toBe(true)
    expect(decideInProcessWorker({ NODE_ENV: "development", AI_TRANSLATION_WORKER_IN_DEV: "true" }).start).toBe(false)
  })
})

describe("describeWorkerLocation", () => {
  test("external mode reports the separate worker process, not a stopped worker", () => {
    const r = describeWorkerLocation("external", false)
    expect(r.location).toBe("separate-process")
    expect(r.note).toMatch(/separate worker process/)
  })

  test("inprocess depends on whether this process started the loop; off is off", () => {
    expect(describeWorkerLocation("inprocess", true).location).toBe("this-process")
    expect(describeWorkerLocation("inprocess", false).location).toBe("not-started")
    expect(describeWorkerLocation("off", true).location).toBe("off")
  })
})
