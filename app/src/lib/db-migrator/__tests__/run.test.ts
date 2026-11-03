import { describe, expect, it } from "vitest"
import { runMigrator, type InvalidJsonRecord, type RunOptions } from "../run"
import type { SourcePort, SourceRow, TargetPort, TargetRow } from "../ports"
import type { SourceSchema, TargetSchema } from "../schema"

/**
 * Orchestration with in-memory ports. Every statement the migrator sends starts
 * with a `/* k2:<purpose>:<table> *\/` tag; the fakes route on it. The fake
 * target is a tiny transactional store (inserts, deferred updates, lookups by
 * key, rollback), so a migrate run can verify inside its transaction and commit.
 */

const col = (name: string, typname: string, pgType: string, nullable: boolean) => ({ name, typname, typtype: "b", pgType, nullable, maxLength: null, isCitext: typname === "citext" })

const targetSchema: TargetSchema = {
  tables: [
    { name: "Project", primaryKey: ["id"], columns: [col("id", "text", "text", false), col("name", "citext", "citext", false), col("active", "bool", "boolean", false)] },
    {
      name: "PlanItem",
      primaryKey: ["id"],
      columns: [
        col("id", "text", "text", false),
        col("projectId", "text", "text", false),
        col("parentId", "text", "text", true),
        col("meta", "jsonb", "jsonb", true),
        col("createdAt", "timestamp", "timestamp(3) without time zone", false),
        col("plannedEnd", "timestamp", "timestamp(3) without time zone", true),
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

const scol = (name: string, dataType: string, columnType: string, nullable: boolean) => ({ name, dataType, columnType, nullable, maxLength: null })
const sourceSchema: SourceSchema = {
  tables: [
    { name: "Project", primaryKey: ["id"], columns: [scol("id", "varchar", "varchar(191)", false), scol("name", "varchar", "varchar(191)", false), scol("active", "tinyint", "tinyint(1)", false)] },
    {
      name: "PlanItem",
      primaryKey: ["id"],
      columns: [
        scol("id", "varchar", "varchar(191)", false),
        scol("projectId", "varchar", "varchar(191)", false),
        scol("parentId", "varchar", "varchar(191)", true),
        scol("meta", "json", "json", true),
        scol("createdAt", "datetime", "datetime(3)", false),
        scol("plannedEnd", "datetime", "datetime(3)", true),
      ],
    },
  ],
}

function baseData(): Record<string, SourceRow[]> {
  return {
    Project: [{ id: "p1", name: "Alpha", active: "1" }],
    PlanItem: [
      { id: "i1", projectId: "p1", parentId: "i2", meta: '{"a":1}', createdAt: "2026-01-01 00:00:00.000", plannedEnd: "2031-01-01 00:00:00.000" },
      { id: "i2", projectId: "p1", parentId: null, meta: null, createdAt: "2026-01-01 00:00:00.000", plannedEnd: null },
    ],
  }
}

const IDS = { source: "src-uuid", target: "sys/16384" }

function tagOf(sql: string): { purpose: string; table: string } {
  const m = /^\/\* k2:([a-z-]+):?([^*]*?) \*\//.exec(sql)
  if (!m) throw new Error(`untagged statement: ${sql.slice(0, 80)}`)
  return { purpose: m[1], table: m[2] }
}

interface FakeSourceOpts {
  data?: Record<string, SourceRow[]>
  /** scan expressions containing this marker report 1 offending row */
  flag?: string
}

function fakeSource(o: FakeSourceOpts = {}): SourcePort & { statements: string[]; calls: string[] } {
  const data = o.data ?? baseData()
  const statements: string[] = []
  const calls: string[] = []
  return {
    statements,
    calls,
    describe: () => "mysql://fake@src:3306/db",
    serverInfo: async () => ({ version: "8.4.0", charset: "utf8mb4", collation: "utf8mb4_unicode_ci", identity: IDS.source }),
    introspect: async () => sourceSchema,
    beginSnapshot: async () => {
      calls.push("beginSnapshot")
    },
    endSnapshot: async () => {
      calls.push("endSnapshot")
    },
    query: async (sql, params) => {
      statements.push(sql)
      const { purpose, table } = tagOf(sql)
      if (purpose === "count" || purpose === "verify-count") return [{ n: String(data[table].length) }]
      if (purpose === "scan") {
        const out: SourceRow = {}
        for (const m of sql.matchAll(/COALESCE\(SUM\((.*?)\), 0\) AS f(\d+)/g)) out[`f${m[2]}`] = o.flag && m[1].includes(o.flag) ? "1" : "0"
        return [out]
      }
      if (purpose === "sample") return [{ id: data[table][0].id }]
      // keyset reads: the whole table on the first call (params empty), nothing after
      if (purpose === "copy" || purpose === "deferred" || purpose === "verify") return params && params.length > 0 ? [] : data[table]
      return []
    },
    stream: async function* (sql) {
      statements.push(sql)
      const { purpose, table } = tagOf(sql)
      if (purpose === "json" || purpose === "citext") for (const row of data[table]) yield row
    },
    close: async () => {},
  }
}

type Store = Record<string, TargetRow[]>

function fakeTarget(): TargetPort & { statements: string[]; transactions: string[]; store: Store } {
  const statements: string[] = []
  const transactions: string[] = []
  let committed: Store = {}
  let work: Store = {}
  const colsOf = (t: string) => targetSchema.tables.find((x) => x.name === t)!.columns.map((c) => c.name)
  const port = {
    statements,
    transactions,
    get store() {
      return work
    },
    describe: () => "postgresql://fake@tgt:5432/db",
    serverInfo: async () => ({ version: "16.4", encoding: "UTF8", localeProvider: "icu", icuLocale: "und", identity: IDS.target }),
    introspect: async () => targetSchema,
    query: async (sql: string, params?: readonly unknown[]): Promise<TargetRow[]> => {
      statements.push(sql)
      const { purpose, table } = tagOf(sql)
      const p = (params ?? []) as (string | null)[][]
      if (purpose === "nonempty") return Object.entries(work).filter(([, r]) => r.length > 0).map(([t]) => ({ t }))
      if (purpose === "insert") {
        const cols = colsOf(table)
        const rows = (work[table] ??= [])
        for (let i = 0; i < p[0].length; i++) rows.push(Object.fromEntries(cols.map((c, k) => [c, p[k][i]])))
        return []
      }
      if (purpose === "deferred-update") {
        const set = [...sql.matchAll(/"(\w+)" = u\.f\d+/g)].map((m) => m[1])
        for (let i = 0; i < p[0].length; i++) {
          const row = (work[table] ?? []).find((r) => r.id === p[0][i])
          if (row) set.forEach((c, k) => (row[c] = p[1 + k][i]))
        }
        return []
      }
      if (purpose === "verify-count") return [{ n: String((work[table] ?? []).length) }]
      if (purpose === "verify-keys") return (work[table] ?? []).filter((r) => p[0].includes(r.id as string))
      return []
    },
    begin: async (readOnly: boolean) => {
      transactions.push(readOnly ? "begin-ro" : "begin-rw")
      work = structuredClone(committed)
    },
    commit: async () => {
      transactions.push("commit")
      committed = structuredClone(work)
    },
    rollback: async () => {
      transactions.push("rollback")
      work = structuredClone(committed)
    },
    close: async () => {},
  }
  return port
}

const base: RunOptions = { mode: "dry-run", batchSize: 1000, allowInvalidJson: false }
const migrate: RunOptions = { ...base, mode: "migrate", expectSourceIdentity: IDS.source, expectTargetIdentity: IDS.target }
const WRITE = /^\/\* k2:[^*]+\*\/\s*(INSERT|UPDATE|DELETE|TRUNCATE|LOCK|SELECT\s+setval|ALTER|CREATE|DROP|ANALYZE)/i

describe("runMigrator", () => {
  it("--dry-run runs the pre-checks and counts, writes nothing and prints the identities for the migrate run", async () => {
    const lines: string[] = []
    const target = fakeTarget()
    const report = await runMigrator(base, { source: fakeSource(), target }, { log: (l) => lines.push(l) })
    expect(report).toMatchObject({ outcome: "ok", exitCode: 0, committed: false })
    expect(report.sourceCounts).toEqual({ Project: 1, PlanItem: 2 })
    expect(report.plan?.deferred).toEqual(["PlanItem_parentId_fkey"])
    expect(target.statements.filter((s) => WRITE.test(s))).toEqual([])
    expect(target.transactions).toEqual([])
    expect(lines.join("\n")).toContain(`--source-identity ${IDS.source} --target-identity ${IDS.target}`)
  })

  it("probes only event timestamps for the future and every DATETIME for zero dates; records coverage", async () => {
    const source = fakeSource()
    const report = await runMigrator(base, { source, target: fakeTarget() })
    const scan = source.statements.find((s) => s.includes("k2:scan:PlanItem")) ?? ""
    expect(scan).toContain("`createdAt` > UTC_TIMESTAMP(3)")
    expect(scan).not.toContain("`plannedEnd` > UTC_TIMESTAMP(3)")
    expect(scan).toContain("YEAR(`plannedEnd`) = 0")
    expect(report.timestampAnalysis.map((c) => `${c.table}.${c.column}`)).toEqual(["PlanItem.createdAt", "PlanItem.plannedEnd"])
  })

  it("migrate: copies, verifies INSIDE the transaction, then commits and analyzes", async () => {
    const target = fakeTarget()
    const report = await runMigrator(migrate, { source: fakeSource(), target })
    expect(report.error).toBeUndefined()
    expect(report).toMatchObject({ outcome: "ok", exitCode: 0, committed: true, analyze: "ok" })
    expect(report.verification).toMatchObject({ insideTransaction: true, mismatched: [] })
    expect(target.transactions).toEqual(["begin-rw", "commit"])
    const verifyAt = target.statements.findIndex((s) => s.includes("k2:verify-keys"))
    const analyzeAt = target.statements.findIndex((s) => s.includes("k2:analyze"))
    expect(verifyAt).toBeGreaterThan(-1)
    expect(analyzeAt).toBeGreaterThan(verifyAt)
    expect(target.store.PlanItem.find((r) => r.id === "i1")?.parentId).toBe("i2")
  })

  it("inserts the deferred self-reference as NULL first, then updates it", async () => {
    const target = fakeTarget()
    const inserts: (readonly unknown[])[] = []
    const q = target.query
    target.query = async (sql, params) => {
      if (sql.includes("k2:insert:PlanItem")) inserts.push(params ?? [])
      return q(sql, params)
    }
    await runMigrator(migrate, { source: fakeSource(), target })
    expect(inserts[0][2]).toEqual([null, null])
    expect(inserts[0][3]).toEqual(['{"a":1}', null])
  })

  it("a verification mismatch inside the transaction rolls back: nothing committed, exit 1", async () => {
    const target = fakeTarget()
    const report = await runMigrator(migrate, { source: fakeSource(), target }, {
      afterCopy: async () => {
        target.store.Project[0].name = "Tampered"
      },
    })
    expect(report).toMatchObject({ outcome: "verify-failed", exitCode: 1, committed: false })
    expect(report.verification?.mismatched).toEqual(["Project"])
    expect(target.transactions).toEqual(["begin-rw", "rollback"])
    expect(target.store).toEqual({})
  })

  it("refuses with exit 2 and does not open a write transaction when a pre-check fails", async () => {
    const target = fakeTarget()
    const q = target.query
    target.query = async (sql, params) => (sql.includes("k2:nonempty") ? [{ t: "Project" }] : q(sql, params))
    const report = await runMigrator(migrate, { source: fakeSource(), target })
    expect(report).toMatchObject({ outcome: "precheck-failed", exitCode: 2 })
    expect(report.precheck.errors.map((e) => e.code)).toContain("TARGET_NOT_EMPTY")
    expect(target.transactions).toEqual([])
  })

  it("rolls back and reports exit 3 (committed false) when the copy is interrupted", async () => {
    const target = fakeTarget()
    const report = await runMigrator(migrate, { source: fakeSource(), target }, {
      onTableCopied: (table) => {
        if (table === "Project") throw new Error("simulated interruption")
      },
    })
    expect(report).toMatchObject({ outcome: "error", exitCode: 3, committed: false })
    expect(report.error).toContain("simulated interruption")
    expect(target.transactions).toEqual(["begin-rw", "rollback"])
  })

  it("refuses a migrate run without the dry-run identities or against a different server", async () => {
    for (const opts of [
      { ...migrate, expectSourceIdentity: null },
      { ...migrate, expectTargetIdentity: "other/1" },
    ]) {
      const target = fakeTarget()
      const report = await runMigrator(opts, { source: fakeSource(), target })
      expect(report.exitCode).toBe(2)
      expect(report.precheck.errors.map((e) => e.code)).toEqual(["IDENTITY_MISMATCH"])
      expect(target.transactions).toEqual([])
    }
  })

  it("warnings need an explicit decision: dry run exit 4, migrate exit 2, accepted -> ok and recorded", async () => {
    const flag = "UTC_TIMESTAMP"
    const dry = await runMigrator(base, { source: fakeSource({ flag }), target: fakeTarget() })
    expect(dry).toMatchObject({ outcome: "needs-decision", exitCode: 4, unacceptedWarnings: ["FUTURE_TIMESTAMP"] })

    const target = fakeTarget()
    const refused = await runMigrator(migrate, { source: fakeSource({ flag }), target })
    expect(refused).toMatchObject({ outcome: "precheck-failed", exitCode: 2 })
    expect(target.transactions).toEqual([])

    const noBaseline = await runMigrator({ ...migrate, acceptWarnings: ["FUTURE_TIMESTAMP"] }, { source: fakeSource({ flag }), target: fakeTarget() })
    expect(noBaseline).toMatchObject({ outcome: "precheck-failed", exitCode: 2 })

    const warningBaseline = { sourceIdentity: IDS.source, warnings: dry.precheck.warnings.map((w) => ({ code: w.code, table: w.table, column: w.column, count: w.count })) }
    const ok = await runMigrator({ ...migrate, acceptWarnings: ["FUTURE_TIMESTAMP"], warningBaseline }, { source: fakeSource({ flag }), target: fakeTarget() })
    expect(ok).toMatchObject({ outcome: "ok", exitCode: 0, committed: true, unacceptedWarnings: [] })
    expect(ok.acceptedWarnings).toEqual([{ code: "FUTURE_TIMESTAMP", count: 1, table: "PlanItem", column: "createdAt" }])
  })

  it("refuses accepted warnings that grew since the reviewed dry run, and deny-listed target identities", async () => {
    const lines: string[] = []
    const warningBaseline = { sourceIdentity: IDS.source, warnings: [{ code: "FUTURE_TIMESTAMP", table: "PlanItem", column: "createdAt", count: 0 }] }
    const target = fakeTarget()
    const grew = await runMigrator({ ...migrate, acceptWarnings: ["FUTURE_TIMESTAMP"], warningBaseline }, { source: fakeSource({ flag: "UTC_TIMESTAMP" }), target }, { log: (l) => lines.push(l) })
    expect(grew).toMatchObject({ outcome: "precheck-failed", exitCode: 2 })
    expect(lines.join(" | ")).toContain("0 -> 1")
    expect(target.transactions).toEqual([])

    const denied = await runMigrator({ ...base, denyTargetIdentities: [IDS.target] }, { source: fakeSource(), target: fakeTarget() })
    expect(denied.exitCode).toBe(2)
    expect(denied.precheck.errors[0].message).toContain("deny list")
  })

  it("a sequence on a table outside the verified set fails loudly", async () => {
    const target = fakeTarget()
    target.introspect = async () => ({ ...targetSchema, sequences: [{ table: "Ghost", column: "id", sequence: "public.Ghost_id_seq" }] })
    const q = target.query
    target.query = async (sql, params) => (sql.includes("k2:verify-seq") ? [{ mx: "1", lv: "1", called: "true" }] : q(sql, params))
    const report = await runMigrator({ ...base, mode: "verify-only" }, { source: fakeSource(), target })
    expect(report.exitCode).toBe(3)
    expect(report.error).toContain("Ghost")
  })

  it("--allow-invalid-json hands keys + originals to the side-file hook before writing and checks the nulled set", async () => {
    const data = baseData()
    data.PlanItem[0].meta = '{"a":"x\\u0000y"}'
    const target = fakeTarget()
    const records: InvalidJsonRecord[] = []
    const order: string[] = []
    const report = await runMigrator({ ...migrate, allowInvalidJson: true }, { source: fakeSource({ data }), target }, {
      onInvalidJsonNulled: (r) => {
        records.push(...r)
        order.push(`hook:${target.transactions.length}`)
      },
    })
    expect(report).toMatchObject({ outcome: "ok", committed: true })
    expect(records).toEqual([{ table: "PlanItem", column: "meta", key: "i1", original: '{"a":"x\\u0000y"}' }])
    expect(order).toEqual(["hook:0"])
    expect(report.copy?.invalidJsonNulled).toBe(1)
    expect(target.store.PlanItem.find((r) => r.id === "i1")?.meta).toBeNull()
    expect(JSON.stringify(report)).not.toContain("x\\\\u0000y")
  })

  it("--allow-invalid-json without a side-file writer aborts before any write", async () => {
    const data = baseData()
    data.PlanItem[0].meta = "{not json"
    const target = fakeTarget()
    const report = await runMigrator({ ...migrate, allowInvalidJson: true }, { source: fakeSource({ data }), target })
    expect(report.exitCode).toBe(3)
    expect(target.transactions).toEqual([])
  })

  it("refuses when no table maps (nothing would be copied)", async () => {
    const source = fakeSource()
    source.introspect = async () => ({ tables: [] })
    const target = fakeTarget()
    target.introspect = async () => ({ ...targetSchema, tables: [], foreignKeys: [], uniqueKeys: [] })
    const report = await runMigrator(base, { source, target })
    expect(report.precheck.errors.map((e) => e.code)).toContain("NO_TABLES")
    expect(report.exitCode).toBe(2)
  })

  it("refuses a target whose Prisma migrations are missing or failed", async () => {
    const target = fakeTarget()
    target.introspect = async () => ({ ...targetSchema, migrations: [{ name: "0_init", finished: false, rolledBack: false }] })
    const report = await runMigrator(base, { source: fakeSource(), target })
    expect(report.precheck.errors.map((e) => e.code)).toContain("TARGET_NOT_MIGRATED")
  })

  it("refuses a schema mismatch between source and target", async () => {
    const source = fakeSource()
    source.introspect = async () => ({
      tables: [
        sourceSchema.tables[0],
        { ...sourceSchema.tables[1], columns: [...sourceSchema.tables[1].columns, scol("legacy", "text", "text", true)] },
        { name: "orphan_table", primaryKey: ["id"], columns: [scol("id", "int", "int", false)] },
      ],
    })
    const report = await runMigrator(base, { source, target: fakeTarget() })
    const codes = report.precheck.errors.map((e) => e.code)
    expect(codes).toContain("SCHEMA_COLUMN_MISMATCH")
    expect(codes).toContain("SCHEMA_TABLE_MISSING_IN_TARGET")
  })

  it("a failing verification read ends with exit 3 and sends nothing more to the source", async () => {
    const source = fakeSource()
    const q = source.query
    let failed = false
    source.query = async (sql, params) => {
      if (sql.includes("k2:verify:")) {
        failed = true
        throw new Error("connection reset while reading")
      }
      if (failed) source.calls.push("query-after-failure")
      return q(sql, params)
    }
    const report = await runMigrator({ ...base, mode: "verify-only" }, { source, target: fakeTarget() })
    expect(report).toMatchObject({ outcome: "error", exitCode: 3 })
    expect(source.calls.filter((c) => c === "query-after-failure" || c === "endSnapshot").length).toBe(1) // only the pre-verify endSnapshot
  })

  it("never puts a row value from a database error into the report", async () => {
    const target = fakeTarget()
    const q = target.query
    target.query = async (sql, params) => {
      if (sql.includes("k2:insert:Project")) {
        throw Object.assign(new Error('invalid input syntax for type boolean: "secret.person@example.test"'), { code: "22P02" })
      }
      return q(sql, params)
    }
    const lines: string[] = []
    const report = await runMigrator(migrate, { source: fakeSource(), target }, { log: (l) => lines.push(l) })
    expect(report.exitCode).toBe(3)
    expect(report.error).toContain("22P02")
    expect(JSON.stringify(report) + lines.join("\n")).not.toContain("secret.person@example.test")
  })

  it("verify-only flags a sequence behind its column's maximum", async () => {
    const target = fakeTarget()
    target.introspect = async () => ({ ...targetSchema, sequences: [{ table: "Project", column: "id", sequence: "public.Project_id_seq" }] })
    const q = target.query
    target.query = async (sql, params) => (sql.includes("k2:verify-seq") ? [{ mx: "5", lv: "3", called: "true" }] : q(sql, params))
    // populate the committed store through a migrate run first
    await runMigrator(migrate, { source: fakeSource(), target })
    const report = await runMigrator({ ...base, mode: "verify-only" }, { source: fakeSource(), target })
    expect(report.exitCode).toBe(1)
    expect(report.verification?.tables.find((t) => t.table === "Project")?.differences.map((d) => d.kind)).toContain("sequence-behind")
  })
})
