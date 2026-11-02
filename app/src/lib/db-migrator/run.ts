/**
 * MySQL -> PostgreSQL data migration (MR K2): orchestration.
 *
 *   introspect both sides -> pre-checks -> (dry run stops here)
 *   -> copy every table in FK order inside ONE PostgreSQL transaction
 *      (deferred FKs filled by UPDATE, sequences reset) -> COMMIT
 *   -> verify counts + ordered content hashes against a fresh source snapshot.
 *
 * Idempotency / re-run: the whole copy is a single transaction on the target,
 * so an interruption at any point (error, kill, lost connection) rolls back to
 * the empty schema and the run is simply repeated - there is no partial state
 * and no state file to get wrong. The target-empty pre-check (re-checked under
 * ACCESS EXCLUSIVE locks inside the transaction) refuses anything else.
 * Kanflow's data volume (well below the size where one transaction is a
 * concern for PostgreSQL) makes this the simplest correct choice.
 *
 * The source is read inside START TRANSACTION WITH CONSISTENT SNAPSHOT, READ
 * ONLY: pre-checks and copy see one point in time even if the freeze leaks.
 */
import { canonicalRow, canonicalValue, ConversionError, toTargetText, type SourceValue, type TargetKind } from "./convert"
import { MigratorError } from "./errors"
import { planCopyOrder, type CopyPlan, type FkEdge } from "./order"
import type { SourcePort, SourceRow, TargetPort } from "./ports"
import {
  checkSchemaCompat,
  CitextDuplicateFinder,
  citextUniqueKeys,
  type Issue,
  type IssueCode,
  type MappedColumn,
  type TableMapping,
} from "./prechecks"
import type { TargetSchema } from "./schema"
import { myIdent, pgIdent, tag } from "./sql"
import { compareSortedStreams, formatKey, type KeyedRow, type TableComparison } from "./verify"

export interface RunOptions {
  mode: "migrate" | "dry-run" | "verify-only"
  batchSize: number
  allowInvalidJson: boolean
}

export interface RunHooks {
  log?: (line: string) => void
  /** Called after each table's rows are inserted (inside the transaction). Tests use it to interrupt. */
  onTableCopied?: (table: string) => void | Promise<void>
}

export const EXIT = { ok: 0, verifyFailed: 1, refused: 2, error: 3, usage: 64 } as const

export interface MigrationReport {
  mode: RunOptions["mode"]
  startedAt: string
  finishedAt: string
  durationMs: number
  source: string
  target: string
  sourceServer?: Record<string, unknown>
  targetServer?: Record<string, unknown>
  precheck: { errors: Issue[]; warnings: Issue[] }
  sourceCounts: Record<string, number>
  plan?: { order: string[]; deferred: string[] }
  copy?: { tables: { table: string; rows: number; ms: number }[]; deferredUpdates: number; sequencesReset: string[]; ms: number }
  verification?: { tables: TableComparison[]; mismatched: string[]; ms: number }
  timings: Record<string, number>
  outcome: "ok" | "precheck-failed" | "verify-failed" | "error"
  exitCode: number
  error?: string
}

const SAMPLE = 20
const FUTURE_TOLERANCE_MIN = 10

/** Known local-time writers (docs/operations/worker.md "UTC_TIMESTAMP"): reported, never shifted. */
const LOCAL_TIME_PROBES = [{ table: "field_translation", column: "requested_at", laterThan: ["translated_at", "started_at"] }]

interface Ports {
  source: SourcePort
  target: TargetPort
}

// ---------------------------------------------------------------- helpers

function keyOf(row: SourceRow, pk: readonly string[]): string {
  return formatKey(pk.map((k) => (row[k] === null ? null : String(row[k]))))
}

function sourceText(value: SourceValue, col: MappedColumn, allowInvalidJson: boolean): string | null {
  try {
    return toTargetText(value, col)
  } catch (e) {
    if (e instanceof ConversionError && e.code === "INVALID_JSON" && allowInvalidJson && col.nullable) return null
    throw e
  }
}

function pkOrderMy(m: TableMapping, binary: boolean): string {
  return m.primaryKey
    .map((k, i) => (binary && m.pkKinds[i] !== "integer" ? `CAST(${myIdent(k)} AS BINARY)` : myIdent(k)))
    .join(", ")
}

function pkOrderPg(m: TableMapping): string {
  return m.primaryKey.map((k, i) => (m.pkKinds[i] === "integer" ? pgIdent(k) : `${pgIdent(k)}::text COLLATE "C"`)).join(", ")
}

function keysetWhere(pk: readonly string[], last: readonly unknown[] | null): string {
  if (last === null) return ""
  return `WHERE (${pk.map(myIdent).join(", ")}) > (${pk.map(() => "?").join(", ")})`
}

function fkEdges(schema: TargetSchema, tables: readonly TableMapping[]): FkEdge[] {
  const byName = new Map(tables.map((t) => [t.table, t]))
  return schema.foreignKeys
    .filter((fk) => byName.has(fk.table) && byName.has(fk.refTable))
    .map((fk) => ({
      ...fk,
      nullable: fk.columns.every((c) => byName.get(fk.table)!.columns.find((x) => x.name === c)?.nullable === true),
    }))
}

// ---------------------------------------------------------------- pre-checks

async function sourceDataChecks(source: SourcePort, m: TableMapping, issues: Issue[]): Promise<void> {
  const t = myIdent(m.sourceTable)
  const checks: { code: IssueCode; column: string; expr: string; severity: Issue["severity"]; message: string }[] = []
  for (const c of m.columns) {
    const q = myIdent(c.name)
    if ((c.kind === "text" || c.kind === "char" || c.kind === "enum") && c.sourceType !== "json") {
      checks.push({ code: "NUL_BYTE", column: c.name, expr: `INSTR(CAST(${q} AS BINARY), X'00') > 0`, severity: "error", message: "contains NUL (0x00); PostgreSQL text cannot hold it - clean the source" })
    }
    if (c.kind === "boolean") {
      checks.push({ code: "BOOLEAN_DOMAIN", column: c.name, expr: `${q} NOT IN (0, 1)`, severity: "error", message: "tinyint(1) value other than 0/1" })
    }
    if ((c.kind === "timestamp" || c.kind === "timestamptz" || c.kind === "date") && (c.sourceType === "datetime" || c.sourceType === "timestamp" || c.sourceType === "date")) {
      checks.push({ code: "INVALID_DATETIME", column: c.name, expr: `(YEAR(${q}) = 0 OR MONTH(${q}) = 0 OR DAYOFMONTH(${q}) = 0)`, severity: "error", message: "zero date" })
      checks.push({
        code: "FUTURE_TIMESTAMP",
        column: c.name,
        expr: `${q} > UTC_TIMESTAMP(3) + INTERVAL ${FUTURE_TOLERANCE_MIN} MINUTE`,
        severity: "warning",
        message: `more than ${FUTURE_TOLERANCE_MIN} min in the future (UTC): possibly written in server local time; copied unchanged`,
      })
    }
    if (c.lengthLimit !== null) {
      checks.push({ code: "LENGTH_OVERFLOW", column: c.name, expr: `CHAR_LENGTH(${q}) > ${c.lengthLimit}`, severity: "error", message: `longer than ${c.lengthLimit} characters` })
    }
    if (c.nullCheck) {
      checks.push({ code: "NULL_IN_NOT_NULL", column: c.name, expr: `${q} IS NULL`, severity: "error", message: "NULL in a column that is NOT NULL in the target" })
    }
  }
  for (const p of LOCAL_TIME_PROBES) {
    const names = new Set(m.columns.map((c) => c.name))
    if (p.table !== m.table || !names.has(p.column) || !p.laterThan.every((c) => names.has(c))) continue
    checks.push({
      code: "LOCAL_TIME_SUSPECT",
      column: p.column,
      expr: `${myIdent(p.column)} > COALESCE(${p.laterThan.map(myIdent).join(", ")}) + INTERVAL 1 HOUR`,
      severity: "warning",
      message: `later than ${p.laterThan.join(" / ")} + 1 h: legacy server-local-time (UTC+7) write; copied unchanged, not shifted`,
    })
  }
  if (checks.length === 0) return
  const sums = checks.map((c, i) => `COALESCE(SUM(${c.expr}), 0) AS f${i}`).join(", ")
  const [counts] = await source.query(`${tag("scan", m.table)} SELECT ${sums} FROM ${t}`)
  for (let i = 0; i < checks.length; i++) {
    const n = Number(counts?.[`f${i}`] ?? 0)
    if (n === 0) continue
    const c = checks[i]
    const rows = await source.query(`${tag("sample", m.table)} SELECT ${m.primaryKey.map(myIdent).join(", ")} FROM ${t} WHERE ${c.expr} LIMIT ${SAMPLE}`)
    issues.push({
      code: c.code,
      severity: c.severity,
      table: m.table,
      column: c.column,
      count: n,
      sampleKeys: rows.map((r) => keyOf(r, m.primaryKey)),
      message: `${m.table}.${c.column}: ${n} row(s) ${c.message}`,
    })
  }
}

async function jsonChecks(source: SourcePort, m: TableMapping, allowInvalidJson: boolean, issues: Issue[]): Promise<void> {
  for (const c of m.columns.filter((x) => x.kind === "json" || x.kind === "jsonb")) {
    const sql = `${tag("json", m.table)} SELECT ${[...m.primaryKey, c.name].map(myIdent).join(", ")} FROM ${myIdent(m.sourceTable)} WHERE ${myIdent(c.name)} IS NOT NULL`
    let count = 0
    const sample: string[] = []
    for await (const row of source.stream(sql)) {
      try {
        toTargetText(row[c.name], c)
      } catch (e) {
        if (!(e instanceof ConversionError)) throw e
        count++
        if (sample.length < SAMPLE) sample.push(keyOf(row, m.primaryKey))
      }
    }
    if (count === 0) continue
    const mapped = allowInvalidJson && c.nullable
    issues.push({
      code: "INVALID_JSON",
      severity: mapped ? "warning" : "error",
      table: m.table,
      column: c.name,
      count,
      sampleKeys: sample,
      message: mapped
        ? `${m.table}.${c.name}: ${count} invalid JSON value(s) will be copied as NULL (--allow-invalid-json)`
        : `${m.table}.${c.name}: ${count} value(s) are not valid JSON for PostgreSQL (unparsable or \\u0000)${c.nullable ? "; --allow-invalid-json copies them as NULL" : ""}`,
    })
  }
}

async function orphanChecks(source: SourcePort, schema: TargetSchema, tables: readonly TableMapping[], issues: Issue[]): Promise<void> {
  const byName = new Map(tables.map((t) => [t.table, t]))
  for (const fk of schema.foreignKeys) {
    const child = byName.get(fk.table)
    const parent = byName.get(fk.refTable)
    if (!child || !parent) continue
    const notNull = fk.columns.map((c) => `c.${myIdent(c)} IS NOT NULL`).join(" AND ")
    const join = fk.columns
      .map((c, i) => `p.${myIdent(fk.refColumns[i])} = c.${myIdent(c)} AND BINARY p.${myIdent(fk.refColumns[i])} = BINARY c.${myIdent(c)}`)
      .join(" AND ")
    const where = `${notNull} AND NOT EXISTS (SELECT 1 FROM ${myIdent(parent.sourceTable)} p WHERE ${join})`
    const [r] = await source.query(`${tag("orphans", fk.table)} SELECT COUNT(*) AS n FROM ${myIdent(child.sourceTable)} c WHERE ${where}`)
    const n = Number(r?.n ?? 0)
    if (n === 0) continue
    const rows = await source.query(
      `${tag("orphans", fk.table)} SELECT ${child.primaryKey.map((k) => `c.${myIdent(k)}`).join(", ")} FROM ${myIdent(child.sourceTable)} c WHERE ${where} LIMIT ${SAMPLE}`,
    )
    issues.push({
      code: "ORPHAN_FK",
      severity: "error",
      table: fk.table,
      column: fk.columns.join(","),
      count: n,
      sampleKeys: rows.map((x) => keyOf(x, child.primaryKey)),
      message: `${fk.name}: ${n} row(s) reference a missing parent in ${fk.refTable} (compared byte-exact, as PostgreSQL will)`,
    })
  }
}

async function citextChecks(source: SourcePort, schema: TargetSchema, tables: readonly TableMapping[], issues: Issue[]): Promise<void> {
  const byName = new Map(tables.map((t) => [t.table, t]))
  for (const uk of citextUniqueKeys(schema)) {
    const m = byName.get(uk.table)
    if (!m) continue
    const mask = uk.columns.map((c) => m.columns.find((x) => x.name === c)?.isCitext === true)
    const finder = new CitextDuplicateFinder(mask)
    const sql = `${tag("citext", m.table)} SELECT ${[...m.primaryKey, ...uk.columns].map(myIdent).join(", ")} FROM ${myIdent(m.sourceTable)}`
    for await (const row of source.stream(sql)) {
      finder.add(
        keyOf(row, m.primaryKey),
        uk.columns.map((c) => (row[c] === null ? null : String(row[c]))),
      )
    }
    const dups = finder.duplicates()
    if (dups.length === 0) continue
    issues.push({
      code: "CITEXT_DUPLICATE",
      severity: "error",
      table: m.table,
      column: uk.columns.join(","),
      count: dups.length,
      sampleKeys: dups.slice(0, SAMPLE).map((d) => `${d.value} <- ${d.keys.join(", ")}`),
      message: `${uk.name}: ${dups.length} value(s) collide case-insensitively (citext); resolve them in the source first`,
    })
  }
}

async function targetChecks(target: TargetPort, schema: TargetSchema, tables: readonly TableMapping[], issues: Issue[], requireEmpty: boolean): Promise<void> {
  const applied = schema.migrations.filter((x) => !x.rolledBack)
  const unfinished = applied.filter((x) => !x.finished)
  if (applied.length === 0 || unfinished.length > 0) {
    issues.push({
      code: "TARGET_NOT_MIGRATED",
      severity: "error",
      count: Math.max(1, unfinished.length),
      sampleKeys: unfinished.map((x) => x.name),
      message: applied.length === 0 ? "target has no applied Prisma migration: run `npx prisma migrate deploy` first" : "target has unfinished/failed Prisma migrations",
    })
  }
  const info = await target.serverInfo()
  if (info.encoding.toUpperCase() !== "UTF8") {
    issues.push({ code: "TARGET_ENCODING", severity: "error", count: 1, sampleKeys: [], message: `target database encoding is ${info.encoding}, expected UTF8` })
  }
  if (info.localeProvider !== "icu" || info.icuLocale !== "und") {
    issues.push({
      code: "TARGET_LOCALE",
      severity: "warning",
      count: 1,
      sampleKeys: [],
      message: `target locale is ${info.localeProvider}/${info.icuLocale ?? "-"}; the platform standard is ICU "und" (sort order differs)`,
    })
  }
  if (!requireEmpty || tables.length === 0) return
  const nonEmpty = await nonEmptyTables(target, tables)
  if (nonEmpty.length > 0) {
    issues.push({
      code: "TARGET_NOT_EMPTY",
      severity: "error",
      count: nonEmpty.length,
      sampleKeys: nonEmpty.slice(0, SAMPLE),
      message: `target application tables already hold rows (${nonEmpty.length} table(s)); the migrator only writes into an empty, freshly migrated schema`,
    })
  }
}

async function nonEmptyTables(target: TargetPort, tables: readonly TableMapping[]): Promise<string[]> {
  const parts = tables.map((t) => `SELECT ${pgLiteral(t.table)} AS t WHERE EXISTS (SELECT 1 FROM ${pgIdent(t.table)})`)
  const rows = await target.query(`${tag("nonempty")} ${parts.join(" UNION ALL ")}`)
  return rows.map((r) => String(r.t))
}

function pgLiteral(s: string): string {
  return `'${s.replace(/'/g, "''")}'`
}

// ---------------------------------------------------------------- copy

async function copyTable(
  ports: Ports,
  m: TableMapping,
  deferredCols: ReadonlySet<string>,
  opts: RunOptions,
  total: number,
  log: (l: string) => void,
): Promise<number> {
  const cols = m.columns
  const select = cols.map((c) => myIdent(c.name)).join(", ")
  const insert =
    `${tag("insert", m.table)} INSERT INTO ${pgIdent(m.table)} (${cols.map((c) => pgIdent(c.name)).join(", ")}) ` +
    `SELECT ${cols.map((c, i) => `u.c${i}::${c.pgType}`).join(", ")} FROM unnest(${cols.map((_, i) => `$${i + 1}::text[]`).join(", ")}) AS u(${cols.map((_, i) => `c${i}`).join(", ")})`
  let last: unknown[] | null = null
  let copied = 0
  let nextLog = 0
  let logged = -1
  for (;;) {
    const sql = `${tag("copy", m.table)} SELECT ${select} FROM ${myIdent(m.sourceTable)} ${keysetWhere(m.primaryKey, last)} ORDER BY ${pkOrderMy(m, false)} LIMIT ${opts.batchSize}`
    const rows = await ports.source.query(sql, last ?? [])
    if (rows.length === 0) break
    const arrays: (string | null)[][] = cols.map(() => [])
    for (const row of rows) {
      cols.forEach((c, i) => {
        if (deferredCols.has(c.name)) {
          arrays[i].push(null)
          return
        }
        try {
          arrays[i].push(sourceText(row[c.name], c, opts.allowInvalidJson))
        } catch (e) {
          if (e instanceof ConversionError) {
            throw new MigratorError("CONVERSION", `${m.table}.${c.name} key ${keyOf(row, m.primaryKey)}: ${e.code} ${e.message}`)
          }
          throw e
        }
      })
    }
    await ports.target.query(insert, arrays)
    copied += rows.length
    const lastRow = rows[rows.length - 1]
    last = m.primaryKey.map((k) => lastRow[k])
    if (copied >= nextLog) {
      log(`[copy] ${m.table}: ${copied}/${total} rows`)
      nextLog = copied + Math.max(opts.batchSize, Math.ceil(total / 10))
      logged = copied
    }
    if (rows.length < opts.batchSize) break
  }
  if (logged !== copied || copied === 0) log(`[copy] ${m.table}: ${copied}/${total} rows`)
  return copied
}

async function applyDeferred(ports: Ports, m: TableMapping, edge: FkEdge, opts: RunOptions): Promise<number> {
  const pk = m.primaryKey
  const fkCols = edge.columns
  const colOf = (n: string): MappedColumn => m.columns.find((c) => c.name === n)!
  const notNull = fkCols.map((c) => `${myIdent(c)} IS NOT NULL`).join(" OR ")
  const all = [...pk, ...fkCols]
  const update =
    `${tag("deferred-update", m.table)} UPDATE ${pgIdent(m.table)} AS t SET ${fkCols.map((c, i) => `${pgIdent(c)} = u.f${i}::${colOf(c).pgType}`).join(", ")} ` +
    `FROM unnest(${all.map((_, i) => `$${i + 1}::text[]`).join(", ")}) AS u(${[...pk.map((_, i) => `k${i}`), ...fkCols.map((_, i) => `f${i}`)].join(", ")}) ` +
    `WHERE ${pk.map((k, i) => `t.${pgIdent(k)} = u.k${i}::${colOf(k).pgType}`).join(" AND ")}`
  let last: unknown[] | null = null
  let updated = 0
  for (;;) {
    const keyset = last === null ? "" : `AND (${pk.map(myIdent).join(", ")}) > (${pk.map(() => "?").join(", ")})`
    const sql = `${tag("deferred", m.table)} SELECT ${all.map(myIdent).join(", ")} FROM ${myIdent(m.sourceTable)} WHERE (${notNull}) ${keyset} ORDER BY ${pkOrderMy(m, false)} LIMIT ${opts.batchSize}`
    const rows = await ports.source.query(sql, last ?? [])
    if (rows.length === 0) break
    const arrays = all.map((n) => rows.map((r) => toTargetText(r[n], colOf(n))))
    await ports.target.query(update, arrays)
    updated += rows.length
    const lastRow = rows[rows.length - 1]
    last = pk.map((k) => lastRow[k])
    if (rows.length < opts.batchSize) break
  }
  return updated
}

// ---------------------------------------------------------------- verify

async function* sourceKeyed(source: SourcePort, m: TableMapping, opts: RunOptions): AsyncIterable<KeyedRow> {
  const kinds: TargetKind[] = m.columns.map((c) => c.kind)
  const pkIdx = m.primaryKey.map((k) => m.columns.findIndex((c) => c.name === k))
  const sql = `${tag("verify", m.table)} SELECT ${m.columns.map((c) => myIdent(c.name)).join(", ")} FROM ${myIdent(m.sourceTable)} ORDER BY ${pkOrderMy(m, true)}`
  for await (const row of source.stream(sql)) {
    const texts = m.columns.map((c) => {
      try {
        return sourceText(row[c.name], c, opts.allowInvalidJson)
      } catch (e) {
        if (e instanceof ConversionError) return `!${e.code}`
        throw e
      }
    })
    yield { key: pkIdx.map((i) => canonicalValue(kinds[i], texts[i])), canon: canonicalRow(kinds, texts) }
  }
}

async function* targetKeyed(target: TargetPort, m: TableMapping): AsyncIterable<KeyedRow> {
  const kinds: TargetKind[] = m.columns.map((c) => c.kind)
  const pkIdx = m.primaryKey.map((k) => m.columns.findIndex((c) => c.name === k))
  const sql = `${tag("verify", m.table)} SELECT ${m.columns.map((c) => pgIdent(c.name)).join(", ")} FROM ${pgIdent(m.table)} ORDER BY ${pkOrderPg(m)}`
  for await (const row of target.stream(sql)) {
    const texts = m.columns.map((c) => row[c.name] ?? null)
    yield { key: pkIdx.map((i) => canonicalValue(kinds[i], texts[i])), canon: canonicalRow(kinds, texts) }
  }
}

async function verifyAll(ports: Ports, tables: readonly TableMapping[], opts: RunOptions, log: (l: string) => void): Promise<TableComparison[]> {
  const out: TableComparison[] = []
  await ports.source.beginSnapshot()
  await ports.target.begin(true)
  try {
    for (const m of tables) {
      const c = await compareSortedStreams(m.table, sourceKeyed(ports.source, m, opts), targetKeyed(ports.target, m), m.pkKinds)
      out.push(c)
      log(
        `[verify] ${m.table}: ${c.match ? "OK" : "MISMATCH"} source ${c.sourceRows} / target ${c.targetRows} rows, sha256 ${c.sourceHash.slice(0, 12)}${c.match ? "" : ` vs ${c.targetHash.slice(0, 12)}`}` +
          (c.differences.length > 0 ? `; first differences: ${c.differences.map((d) => `${d.kind} ${d.key}`).join("; ")}` : ""),
      )
    }
  } finally {
    await ports.target.commit()
    await ports.source.endSnapshot()
  }
  return out
}

// ---------------------------------------------------------------- run

export async function runMigrator(opts: RunOptions, ports: Ports, hooks: RunHooks = {}): Promise<MigrationReport> {
  const log = hooks.log ?? (() => {})
  const t0 = Date.now()
  const timings: Record<string, number> = {}
  const report: MigrationReport = {
    mode: opts.mode,
    startedAt: new Date(t0).toISOString(),
    finishedAt: "",
    durationMs: 0,
    source: ports.source.describe(),
    target: ports.target.describe(),
    precheck: { errors: [], warnings: [] },
    sourceCounts: {},
    timings,
    outcome: "ok",
    exitCode: EXIT.ok,
  }
  const finish = (outcome: MigrationReport["outcome"], exitCode: number): MigrationReport => {
    report.outcome = outcome
    report.exitCode = exitCode
    report.finishedAt = new Date().toISOString()
    report.durationMs = Date.now() - t0
    return report
  }
  const phase = async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
    const s = Date.now()
    try {
      return await fn()
    } finally {
      timings[name] = Date.now() - s
    }
  }

  let snapshotOpen = false
  try {
    const issues: Issue[] = []
    const [srcSchema, tgtSchema, srcInfo, tgtInfo] = await phase("introspect", async () =>
      Promise.all([ports.source.introspect(), ports.target.introspect(), ports.source.serverInfo(), ports.target.serverInfo()]),
    )
    report.sourceServer = { ...srcInfo }
    report.targetServer = { ...tgtInfo }
    if (srcInfo.charset !== "utf8mb4") {
      issues.push({ code: "SOURCE_CHARSET", severity: "warning", count: 1, sampleKeys: [], message: `source database default charset is ${srcInfo.charset}, production uses utf8mb4` })
    }
    const compat = checkSchemaCompat(srcSchema, tgtSchema)
    issues.push(...compat.issues)
    const tables = compat.tables

    let plan: CopyPlan | null = null
    try {
      plan = planCopyOrder(
        tables.map((t) => t.table),
        fkEdges(tgtSchema, tables),
      )
      report.plan = { order: plan.order, deferred: plan.deferred.map((e) => e.name) }
    } catch (e) {
      if (!(e instanceof MigratorError)) throw e
      issues.push({ code: "FK_CYCLE_UNBREAKABLE", severity: "error", count: 1, sampleKeys: [], message: e.message })
    }
    const ordered = plan ? plan.order.map((n) => tables.find((t) => t.table === n)!) : tables

    await ports.source.beginSnapshot()
    snapshotOpen = true
    await phase("precheck", async () => {
      await targetChecks(ports.target, tgtSchema, ordered, issues, opts.mode !== "verify-only")
      if (opts.mode === "verify-only") return
      for (const m of ordered) {
        await sourceDataChecks(ports.source, m, issues)
        await jsonChecks(ports.source, m, opts.allowInvalidJson, issues)
      }
      await orphanChecks(ports.source, tgtSchema, ordered, issues)
      await citextChecks(ports.source, tgtSchema, ordered, issues)
    })
    for (const m of ordered) {
      const [r] = await ports.source.query(`${tag("count", m.table)} SELECT COUNT(*) AS n FROM ${myIdent(m.sourceTable)}`)
      report.sourceCounts[m.table] = Number(r?.n ?? 0)
    }
    report.precheck.errors = issues.filter((i) => i.severity === "error")
    report.precheck.warnings = issues.filter((i) => i.severity === "warning")
    for (const i of issues) log(`[precheck] ${i.severity.toUpperCase()} ${i.code} ${i.message}${i.sampleKeys.length > 0 ? ` - keys: ${i.sampleKeys.join(" | ")}` : ""}`)
    const totalRows = Object.values(report.sourceCounts).reduce((a, b) => a + b, 0)
    log(`[precheck] ${ordered.length} tables, ${totalRows} source rows, ${report.precheck.errors.length} error(s), ${report.precheck.warnings.length} warning(s)`)
    if (report.precheck.errors.length > 0 || plan === null) {
      await ports.source.endSnapshot()
      snapshotOpen = false
      return finish("precheck-failed", EXIT.refused)
    }
    if (opts.mode === "dry-run") {
      await ports.source.endSnapshot()
      snapshotOpen = false
      log("[dry-run] no writes performed")
      return finish("ok", EXIT.ok)
    }

    if (opts.mode === "migrate") {
      const copyStart = Date.now()
      const deferredBy = new Map<string, Set<string>>()
      for (const e of plan.deferred) deferredBy.set(e.table, new Set([...(deferredBy.get(e.table) ?? []), ...e.columns]))
      const copied: { table: string; rows: number; ms: number }[] = []
      let deferredUpdates = 0
      const sequencesReset: string[] = []
      await ports.target.begin(false)
      try {
        await ports.target.query(`${tag("lock")} LOCK TABLE ${ordered.map((t) => pgIdent(t.table)).join(", ")} IN ACCESS EXCLUSIVE MODE`)
        const raced = await nonEmptyTables(ports.target, ordered)
        if (raced.length > 0) throw new Error(`target tables became non-empty before the copy started: ${raced.join(", ")}`)
        for (const m of ordered) {
          const s = Date.now()
          const rows = await copyTable(ports, m, deferredBy.get(m.table) ?? new Set(), opts, report.sourceCounts[m.table], log)
          copied.push({ table: m.table, rows, ms: Date.now() - s })
          await hooks.onTableCopied?.(m.table)
        }
        for (const e of plan.deferred) {
          const n = await applyDeferred(ports, ordered.find((t) => t.table === e.table)!, e, opts)
          deferredUpdates += n
          log(`[copy] deferred ${e.name}: ${n} row(s) updated`)
        }
        for (const s of tgtSchema.sequences) {
          await ports.target.query(
            `${tag("setval", s.table)} SELECT setval($1::regclass, COALESCE((SELECT MAX(${pgIdent(s.column)}) FROM ${pgIdent(s.table)}), 0) + 1, false)`,
            [s.sequence],
          )
          sequencesReset.push(s.sequence)
        }
        await ports.target.commit()
      } catch (e) {
        await ports.target.rollback().catch((re: unknown) => log(`[copy] ROLLBACK failed too: ${String(re)}`))
        throw e
      }
      await ports.source.endSnapshot()
      snapshotOpen = false
      report.copy = { tables: copied, deferredUpdates, sequencesReset, ms: Date.now() - copyStart }
      timings.copy = report.copy.ms
      log(`[copy] committed ${copied.reduce((a, b) => a + b.rows, 0)} rows in ${report.copy.ms} ms`)
    } else {
      await ports.source.endSnapshot()
      snapshotOpen = false
    }

    const vStart = Date.now()
    const comparisons = await verifyAll(ports, ordered, opts, log)
    const mismatched = comparisons.filter((c) => !c.match).map((c) => c.table)
    report.verification = { tables: comparisons, mismatched, ms: Date.now() - vStart }
    timings.verify = report.verification.ms
    log(mismatched.length === 0 ? `[verify] all ${comparisons.length} tables match` : `[verify] MISMATCH in ${mismatched.length} table(s): ${mismatched.join(", ")}`)
    return finish(mismatched.length === 0 ? "ok" : "verify-failed", mismatched.length === 0 ? EXIT.ok : EXIT.verifyFailed)
  } catch (e) {
    if (snapshotOpen) await ports.source.endSnapshot().catch((x: unknown) => log(`[error] closing the source snapshot failed too: ${String(x)}`))
    report.error = e instanceof Error ? e.message : String(e)
    log(`[error] ${report.error}`)
    return finish("error", EXIT.error)
  }
}
