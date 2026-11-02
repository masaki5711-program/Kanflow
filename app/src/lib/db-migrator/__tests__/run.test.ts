import { describe, expect, it } from "vitest"
import { runMigrator, type RunOptions } from "../run"
import type { SourcePort, SourceRow, TargetPort } from "../ports"
import type { SourceSchema, TargetSchema } from "../schema"

/**
 * Orchestration with in-memory ports. Every statement the migrator sends starts
 * with a `/* k2:<purpose>:<table> *\/` tag; the fakes route on it and record
 * everything so a test can prove what was (not) written.
 */

const targetSchema: TargetSchema = {
  tables: [
    {
      name: "Project",
      primaryKey: ["id"],
      columns: [
        { name: "id", typname: "text", typtype: "b", pgType: "text", nullable: false, maxLength: null, isCitext: false },
        { name: "name", typname: "citext", typtype: "b", pgType: "citext", nullable: false, maxLength: null, isCitext: true },
        { name: "active", typname: "bool", typtype: "b", pgType: "boolean", nullable: false, maxLength: null, isCitext: false },
      ],
    },
    {
      name: "PlanItem",
      primaryKey: ["id"],
      columns: [
        { name: "id", typname: "text", typtype: "b", pgType: "text", nullable: false, maxLength: null, isCitext: false },
        { name: "projectId", typname: "text", typtype: "b", pgType: "text", nullable: false, maxLength: null, isCitext: false },
        { name: "parentId", typname: "text", typtype: "b", pgType: "text", nullable: true, maxLength: null, isCitext: false },
        { name: "meta", typname: "jsonb", typtype: "b", pgType: "jsonb", nullable: true, maxLength: null, isCitext: false },
        { name: "createdAt", typname: "timestamp", typtype: "b", pgType: "timestamp(3) without time zone", nullable: false, maxLength: null, isCitext: false },
        { name: "plannedEnd", typname: "timestamp", typtype: "b", pgType: "timestamp(3) without time zone", nullable: true, maxLength: null, isCitext: false },
      ],
    },
  ],
  foreignKeys: [
    { name: "PlanItem_projectId_fkey", table: "PlanItem", columns: ["projectId"], refTable: "Project", refColumns: ["id"] },
    { name: "PlanItem_parentId_fkey", table: "PlanItem", columns: ["parentId"], refTable: "PlanItem", refColumns: ["id"] },
  ],
  uniqueKeys: [{ name: "Project_name_key", table: "Project", columns: ["name"] }],
  sequences: [],
  migrations: [{ name: "0_init", finished: true, rolledBack: false }],
}

const sourceSchema: SourceSchema = {
  tables: [
    {
      name: "Project",
      primaryKey: ["id"],
      columns: [
        { name: "id", dataType: "varchar", columnType: "varchar(191)", nullable: false, maxLength: 191 },
        { name: "name", dataType: "varchar", columnType: "varchar(191)", nullable: false, maxLength: 191 },
        { name: "active", dataType: "tinyint", columnType: "tinyint(1)", nullable: false, maxLength: null },
      ],
    },
    {
      name: "PlanItem",
      primaryKey: ["id"],
      columns: [
        { name: "id", dataType: "varchar", columnType: "varchar(191)", nullable: false, maxLength: 191 },
        { name: "projectId", dataType: "varchar", columnType: "varchar(191)", nullable: false, maxLength: 191 },
        { name: "parentId", dataType: "varchar", columnType: "varchar(191)", nullable: true, maxLength: 191 },
        { name: "meta", dataType: "json", columnType: "json", nullable: true, maxLength: null },
        { name: "createdAt", dataType: "datetime", columnType: "datetime(3)", nullable: false, maxLength: null },
        { name: "plannedEnd", dataType: "datetime", columnType: "datetime(3)", nullable: true, maxLength: null },
      ],
    },
  ],
}

const data: Record<string, SourceRow[]> = {
  Project: [{ id: "p1", name: "Alpha", active: "1" }],
  PlanItem: [
    { id: "i1", projectId: "p1", parentId: "i2", meta: '{"a":1}', createdAt: "2026-01-01 00:00:00.000", plannedEnd: "2031-01-01 00:00:00.000" },
    { id: "i2", projectId: "p1", parentId: null, meta: null, createdAt: "2026-01-01 00:00:00.000", plannedEnd: null },
  ],
}

function tagOf(sql: string): { purpose: string; table: string } {
  const m = /^\/\* k2:([a-z-]+):?([^*]*?) \*\//.exec(sql)
  if (!m) throw new Error(`untagged statement: ${sql.slice(0, 80)}`)
  return { purpose: m[1], table: m[2] }
}

function fakeSource(): SourcePort & { statements: string[] } {
  const statements: string[] = []
  const copied = new Set<string>()
  return {
    statements,
    describe: () => "mysql://fake@src:3306/db",
    serverInfo: async () => ({ version: "8.4.0", charset: "utf8mb4", collation: "utf8mb4_unicode_ci" }),
    introspect: async () => sourceSchema,
    beginSnapshot: async () => {},
    endSnapshot: async () => {},
    query: async (sql) => {
      statements.push(sql)
      const { purpose, table } = tagOf(sql)
      if (purpose === "count") return [{ n: String(data[table].length) }]
      if (purpose === "copy" || purpose === "deferred") {
        if (copied.has(`${purpose}:${table}`)) return []
        copied.add(`${purpose}:${table}`)
        return data[table]
      }
      return []
    },
    stream: async function* (sql) {
      statements.push(sql)
      const { purpose, table } = tagOf(sql)
      if (purpose === "verify") for (const row of data[table]) yield row
    },
    close: async () => {},
  }
}

function fakeTarget(): TargetPort & { statements: string[]; transactions: string[] } {
  const statements: string[] = []
  const transactions: string[] = []
  return {
    statements,
    transactions,
    describe: () => "postgresql://fake@tgt:5432/db",
    serverInfo: async () => ({ version: "16.4", encoding: "UTF8", localeProvider: "icu", icuLocale: "und" }),
    introspect: async () => targetSchema,
    query: async (sql) => {
      statements.push(sql)
      tagOf(sql)
      return []
    },
    stream: async function* (sql) {
      statements.push(sql)
      tagOf(sql)
    },
    begin: async (readOnly) => {
      transactions.push(readOnly ? "begin-ro" : "begin-rw")
    },
    commit: async () => {
      transactions.push("commit")
    },
    rollback: async () => {
      transactions.push("rollback")
    },
    close: async () => {},
  }
}

const base: RunOptions = { mode: "dry-run", batchSize: 1000, allowInvalidJson: false }
const WRITE = /^\/\* k2:[^*]+\*\/\s*(INSERT|UPDATE|DELETE|TRUNCATE|LOCK|SELECT\s+setval|ALTER|CREATE|DROP)/i

describe("runMigrator", () => {
  it("--dry-run runs the pre-checks and counts, and writes nothing", async () => {
    const source = fakeSource()
    const target = fakeTarget()
    const report = await runMigrator(base, { source, target })
    expect(report.outcome).toBe("ok")
    expect(report.exitCode).toBe(0)
    expect(report.sourceCounts).toEqual({ Project: 1, PlanItem: 2 })
    expect(report.plan?.order).toEqual(["Project", "PlanItem"])
    expect(report.plan?.deferred).toEqual(["PlanItem_parentId_fkey"])
    expect(target.statements.filter((s) => WRITE.test(s))).toEqual([])
    expect(target.transactions).not.toContain("begin-rw")
    expect(report.copy).toBeUndefined()
  })

  it("checks only write timestamps for future values (legacy local time), every DATETIME for zero dates", async () => {
    const source = fakeSource()
    await runMigrator(base, { source, target: fakeTarget() })
    const scan = source.statements.find((s) => s.includes("k2:scan:PlanItem")) ?? ""
    expect(scan).toContain("`createdAt` > UTC_TIMESTAMP(3)")
    expect(scan).not.toContain("`plannedEnd` > UTC_TIMESTAMP(3)")
    expect(scan).toContain("YEAR(`plannedEnd`) = 0")
  })

  it("the write detector of this test does see writes in migrate mode", async () => {
    const source = fakeSource()
    const target = fakeTarget()
    const report = await runMigrator({ ...base, mode: "migrate" }, { source, target })
    const writes = target.statements.filter((s) => WRITE.test(s))
    expect(writes.some((s) => s.includes("k2:insert:Project"))).toBe(true)
    expect(writes.some((s) => s.includes("k2:deferred-update:PlanItem"))).toBe(true)
    expect(target.transactions).toEqual(expect.arrayContaining(["begin-rw", "commit"]))
    // The fake target returns no rows on verification: the run must fail loudly.
    expect(report.outcome).toBe("verify-failed")
    expect(report.exitCode).toBe(1)
    expect(report.copy?.tables.map((t) => [t.table, t.rows])).toEqual([["Project", 1], ["PlanItem", 2]])
  })

  it("inserts the deferred self-reference as NULL first, then updates it", async () => {
    const source = fakeSource()
    const target = fakeTarget()
    const inserts: (readonly unknown[])[] = []
    target.query = async (sql, params) => {
      target.statements.push(sql)
      if (sql.includes("k2:insert:PlanItem")) inserts.push(params ?? [])
      return []
    }
    await runMigrator({ ...base, mode: "migrate" }, { source, target })
    // column order id, projectId, parentId, meta, createdAt -> parentId array is all NULL
    expect(inserts[0][2]).toEqual([null, null])
    expect(inserts[0][3]).toEqual(['{"a":1}', null])
  })

  it("refuses with exit 2 and does not open a write transaction when a pre-check fails", async () => {
    const source = fakeSource()
    const target = fakeTarget()
    target.query = async (sql) => {
      target.statements.push(sql)
      if (sql.includes("k2:nonempty")) return [{ t: "Project" }]
      return []
    }
    const report = await runMigrator({ ...base, mode: "migrate" }, { source, target })
    expect(report.outcome).toBe("precheck-failed")
    expect(report.exitCode).toBe(2)
    expect(report.precheck.errors.map((e) => e.code)).toContain("TARGET_NOT_EMPTY")
    expect(target.transactions).not.toContain("begin-rw")
    expect(target.statements.filter((s) => WRITE.test(s))).toEqual([])
  })

  it("rolls back and reports exit 3 when the copy is interrupted", async () => {
    const source = fakeSource()
    const target = fakeTarget()
    const report = await runMigrator({ ...base, mode: "migrate" }, { source, target }, {
      onTableCopied: (table) => {
        if (table === "Project") throw new Error("simulated interruption")
      },
    })
    expect(report.outcome).toBe("error")
    expect(report.exitCode).toBe(3)
    expect(report.error).toContain("simulated interruption")
    expect(target.transactions).toContain("rollback")
    expect(target.transactions).not.toContain("commit")
  })

  it("refuses a target whose Prisma migrations are missing or failed", async () => {
    const source = fakeSource()
    const target = fakeTarget()
    target.introspect = async () => ({ ...targetSchema, migrations: [{ name: "0_init", finished: false, rolledBack: false }] })
    const report = await runMigrator(base, { source, target })
    expect(report.precheck.errors.map((e) => e.code)).toContain("TARGET_NOT_MIGRATED")
    expect(report.exitCode).toBe(2)
  })

  it("refuses a schema mismatch between source and target", async () => {
    const source = fakeSource()
    source.introspect = async () => ({
      tables: [
        sourceSchema.tables[0],
        { ...sourceSchema.tables[1], columns: [...sourceSchema.tables[1].columns, { name: "legacy", dataType: "text", columnType: "text", nullable: true, maxLength: null }] },
        { name: "orphan_table", primaryKey: ["id"], columns: [{ name: "id", dataType: "int", columnType: "int", nullable: false, maxLength: null }] },
      ],
    })
    const report = await runMigrator(base, { source, target: fakeTarget() })
    const codes = report.precheck.errors.map((e) => e.code)
    expect(codes).toContain("SCHEMA_COLUMN_MISMATCH")
    expect(codes).toContain("SCHEMA_TABLE_MISSING_IN_TARGET")
  })

  it("a failing verification stream ends the run with exit 3 and sends nothing more to the source", async () => {
    // A half-read mysql2 stream leaves the connection paused: a COMMIT queued behind it would
    // hang. After a stream failure the run must stop using the source (closing it ends the snapshot).
    const source = fakeSource()
    const calls: string[] = []
    let streamFailed = false
    source.endSnapshot = async () => {
      calls.push(streamFailed ? "endSnapshot-after-failure" : "endSnapshot")
    }
    source.stream = async function* (sql) {
      source.statements.push(sql)
      if (sql.includes("k2:verify:")) {
        streamFailed = true
        throw new Error("connection reset while streaming")
      }
    }
    const report = await runMigrator({ ...base, mode: "verify-only" }, { source, target: fakeTarget() })
    expect(report.outcome).toBe("error")
    expect(report.exitCode).toBe(3)
    expect(report.error).toContain("connection reset")
    expect(calls).not.toContain("endSnapshot-after-failure")
  })
})
