import { describe, expect, it } from "vitest"
import type { MappedColumn, TableMapping } from "../prechecks"
import { planTimestampProbes } from "../timestamps"

function ts(name: string): MappedColumn {
  return { name, kind: "timestamp", pgType: "timestamp(3) without time zone", sourceType: "datetime", sourceColumnType: "datetime(3)", nullable: true, lengthLimit: null, nullCheck: false, isCitext: false }
}

function table(name: string, cols: string[]): TableMapping {
  return { table: name, sourceTable: name, primaryKey: ["id"], pkKinds: ["text"], columns: cols.map(ts) }
}

describe("planTimestampProbes", () => {
  it("probes event columns against now, against createdAt ordering and for the local offset", () => {
    const { checks, coverage } = planTimestampProbes(table("Task", ["createdAt", "updatedAt", "completedAt", "plannedEnd", "expiresAt", "takenAt"]), 7)
    const by = (col: string) => checks.filter((c) => c.column === col).map((c) => c.code).sort()
    expect(by("createdAt")).toEqual(["FUTURE_TIMESTAMP"])
    expect(by("updatedAt")).toEqual(["FUTURE_TIMESTAMP", "LOCAL_OFFSET_SUSPECT", "TIMESTAMP_BEFORE_CREATED"])
    expect(by("completedAt")).toEqual(["FUTURE_TIMESTAMP", "LOCAL_OFFSET_SUSPECT", "TIMESTAMP_BEFORE_CREATED"])
    expect(by("plannedEnd")).toEqual([])
    expect(by("expiresAt")).toEqual(["LOCAL_OFFSET_SUSPECT", "TIMESTAMP_BEFORE_CREATED"])
    expect(by("takenAt")).toEqual(["FUTURE_TIMESTAMP", "LOCAL_OFFSET_SUSPECT"])
    // 7 h +- 10 min in seconds
    expect(checks.find((c) => c.code === "LOCAL_OFFSET_SUSPECT")?.expr).toContain("BETWEEN 24600 AND 25800")
    expect(coverage.find((c) => c.column === "plannedEnd")?.notProbed[0].probe).toBe("all")
  })

  it("records that order / offset could not be probed without a createdAt sibling", () => {
    const { checks, coverage } = planTimestampProbes(table("field_translation", ["requested_at", "started_at", "translated_at", "updated_at"]), 7)
    expect(checks.filter((c) => c.code === "LOCAL_TIME_SUSPECT").map((c) => c.column)).toEqual(["requested_at"])
    expect(checks.some((c) => c.code === "TIMESTAMP_BEFORE_CREATED" || c.code === "LOCAL_OFFSET_SUSPECT")).toBe(false)
    const req = coverage.find((c) => c.column === "requested_at")!
    expect(req.probes).toEqual(["future", "pipeline-order"])
    expect(req.notProbed.map((n) => n.probe)).toEqual(["before-created", "offset"])
    expect(req.notProbed[0].reason).toContain("no createdAt")
  })

  it("covers every timestamp column exactly once", () => {
    const cols = ["createdAt", "updatedAt", "date", "deletedAt"]
    const { coverage } = planTimestampProbes(table("X", cols), 7)
    expect(coverage.map((c) => c.column)).toEqual(cols)
  })
})
