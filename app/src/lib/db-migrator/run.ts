/**
 * MySQL -> PostgreSQL data migration (MR K2): orchestration.
 *
 *   introspect both sides -> server identities -> pre-checks -> warning decision
 *   -> (dry run stops here)
 *   -> ONE PostgreSQL transaction: lock, copy every table in FK order, fill the
 *      deferred FKs, reset sequences, VERIFY against the copy's source snapshot
 *      -> COMMIT only when every table matches (a mismatch rolls back: the target
 *      stays empty) -> ANALYZE.
 *
 * Idempotency / re-run: an interruption at any point before COMMIT (error, kill,
 * lost connection) leaves the empty schema and the run is simply repeated - no
 * partial state, no state file. If the outcome of COMMIT itself is unknown
 * (report.committed = "unknown"), `--verify-only` tells which side it fell on.
 * The target-empty pre-check (re-checked under ACCESS EXCLUSIVE locks inside the
 * transaction) refuses anything else.
 *
 * The source is read inside START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY.
 * Nothing printed or reported contains a row value: issues carry primary keys
 * (and short hashes of values), errors are passed through sanitizeError.
 */
import { createHmac, randomBytes } from "node:crypto"
import { canonicalRow, canonicalValue, ConversionError, toTargetText, type SourceValue, type TargetKind } from "./convert"
import { MigratorError } from "./errors"
import { planCopyOrder, type CopyPlan, type FkEdge } from "./order"
import type { SourcePort, SourceRow, TargetPort, TargetRow } from "./ports"
import {
  ACCEPTABLE_WARNINGS,
  checkSchemaCompat,
  CitextDuplicateFinder,
  citextUniqueKeys,
  type Issue,
  type IssueCode,
  type MappedColumn,
  type TableMapping,
} from "./prechecks"
import { sanitizeError } from "./sanitize"
import type { TargetSchema } from "./schema"
import { myIdent, pgIdent, tag } from "./sql"
import { planTimestampProbes, type TimestampCoverage } from "./timestamps"
import { formatKey, TableVerifier, type TableComparison, type VerifyRow } from "./verify"

export interface RunOptions {
  mode: "migrate" | "dry-run" | "verify-only"
  batchSize: number
  allowInvalidJson: boolean
  /** --target-superset: the target schema is newer than the source's (prechecks.ts SchemaCompatOptions) */
  targetSuperset?: boolean
  /** warning codes the operator reviewed (--accept-warnings) */
  acceptWarnings?: readonly string[]
  /** identities printed by the dry run; a migrate run refuses without / on mismatch */
  expectSourceIdentity?: string | null
  expectTargetIdentity?: string | null
  localOffsetHours?: number
  /** the dry run's warnings for the same source (--dry-run-report); required to accept warnings */
  warningBaseline?: WarningBaseline | null
  /** server identities that must never be a target (deny-list "id:" entries) */
  denyTargetIdentities?: readonly string[]
}

export interface WarningBaseline {
  sourceIdentity: string
  warnings: { code: string; table?: string; column?: string; count: number }[]
}

/**
 * An accepted warning may not grow between the dry run (reviewed by the
 * approver) and the migrate run, nor appear only now, nor come from another
 * source. Returns the problems (empty = fine).
 */
export function checkWarningBaseline(warnings: readonly Issue[], baseline: WarningBaseline, sourceIdentity: string): string[] {
  if (baseline.sourceIdentity !== sourceIdentity) {
    return [`the --dry-run-report is from a different source (${baseline.sourceIdentity}, now ${sourceIdentity})`]
  }
  const key = (w: { code: string; table?: string; column?: string }) => `${w.code} ${w.table ?? "-"}.${w.column ?? "-"}`
  const before = new Map(baseline.warnings.map((w) => [key(w), w.count]))
  const out: string[] = []
  for (const w of warnings) {
    const prev = before.get(key(w))
    if (prev === undefined) out.push(`${key(w)}: ${w.count} row(s), not in the dry run that was reviewed`)
    else if (w.count > prev) out.push(`${key(w)}: grew since the reviewed dry run (${prev} -> ${w.count})`)
  }
  return out
}

/** One value --allow-invalid-json will copy as NULL. Goes to the protected side file only. */
export interface InvalidJsonRecord {
  table: string
  column: string
  key: string
  original: string
}

export interface RunHooks {
  log?: (line: string) => void
  /** Called after each table's rows are inserted (inside the transaction). Tests use it to interrupt. */
  onTableCopied?: (table: string) => void | Promise<void>
  /**
   * Receives the values --allow-invalid-json will null, BEFORE any write; the CLI writes
   * them to the protected --invalid-json-file. Throwing aborts the run (nothing written).
   */
  onInvalidJsonNulled?: (records: InvalidJsonRecord[]) => void | Promise<void>
  /** Test hook: runs inside the copy transaction after the copy, before verification. */
  afterCopy?: (target: TargetPort) => Promise<void>
}

export const EXIT = { ok: 0, verifyFailed: 1, refused: 2, error: 3, needsDecision: 4, usage: 64 } as const

export interface MigrationReport {
  mode: RunOptions["mode"]
  startedAt: string
  finishedAt: string
  durationMs: number
  source: string
  target: string
  sourceServer?: Record<string, unknown>
  targetServer?: Record<string, unknown>
  precheck: { errors: Issue[]; warnings: Issue[]; info: Issue[] }
  /** warnings the operator accepted (--accept-warnings / --allow-invalid-json) */
  acceptedWarnings: { code: string; count: number; table?: string; column?: string }[]
  /** warning codes that still need a decision */
  unacceptedWarnings: string[]
  timestampAnalysis: TimestampCoverage[]
  sourceCounts: Record<string, number>
  plan?: { order: string[]; deferred: string[] }
  copy?: { tables: { table: string; rows: number; ms: number }[]; deferredUpdates: number; sequencesReset: string[]; invalidJsonNulled: number; ms: number }
  verification?: { tables: TableComparison[]; mismatched: string[]; insideTransaction: boolean; ms: number }
  /** true = COMMIT succeeded; "unknown" = COMMIT was sent but its outcome is not known (run --verify-only) */
  committed: boolean | "unknown"
  analyze?: "ok" | "failed"
  timings: Record<string, number>
  outcome: "ok" | "precheck-failed" | "needs-decision" | "verify-failed" | "error"
  exitCode: number
  error?: string
}

const SAMPLE = 20

interface Ports {
  source: SourcePort
  target: TargetPort
}

// ---------------------------------------------------------------- helpers

function keyOf(row: SourceRow | TargetRow, pk: readonly string[]): string {
  return formatKey(pk.map((k) => (row[k] === null || row[k] === undefined ? null : String(row[k]))))
}

/**
 * Value fingerprint for reports: HMAC-SHA256 with a random key that lives only
 * for one run. Equal values group within a report; the hash cannot be
 * compared with a precomputed list (e.g. hashes of known e-mail addresses)
 * or linked across runs.
 */
export function makeValueHasher(): (value: string) => string {
  const key = randomBytes(32)
  return (value) => createHmac("sha256", key).update(value, "utf8").digest("hex").slice(0, 16)
}

/** Converted text; `nulled` = an invalid JSON value replaced by NULL under --allow-invalid-json. */
function sourceText(value: SourceValue, col: MappedColumn, allowInvalidJson: boolean): { text: string | null; nulled: boolean } {
  try {
    return { text: toTargetText(value, col), nulled: false }
  } catch (e) {
    if (e instanceof ConversionError && e.code === "INVALID_JSON" && allowInvalidJson && col.nullable) return { text: null, nulled: true }
    throw e
  }
}

function pkOrderMy(m: TableMapping): string {
  return m.primaryKey.map(myIdent).join(", ")
}

function keysetMy(pk: readonly string[], last: readonly unknown[] | null, joiner: "WHERE" | "AND"): string {
  if (last === null) return ""
  return `${joiner} (${pk.map(myIdent).join(", ")}) > (${pk.map(() => "?").join(", ")})`
}

/**
 * Foreign keys between copied tables whose columns (both sides) are all copied. With --target-superset a key on a
 * target-only column is left out: that column gets its default / NULL, so it references nothing in the copied data.
 */
function copiedForeignKeys(schema: TargetSchema, tables: readonly TableMapping[]): TargetSchema["foreignKeys"] {
  const byName = new Map(tables.map((t) => [t.table, t]))
  const has = (table: string, col: string) => byName.get(table)?.columns.some((c) => c.name === col) === true
  return schema.foreignKeys.filter((fk) => byName.has(fk.table) && byName.has(fk.refTable) && fk.columns.every((c) => has(fk.table, c)) && fk.refColumns.every((c) => has(fk.refTable, c)))
}

function fkEdges(schema: TargetSchema, tables: readonly TableMapping[]): FkEdge[] {
  const byName = new Map(tables.map((t) => [t.table, t]))
  return copiedForeignKeys(schema, tables)
    .map((fk) => ({
      ...fk,
      nullable: fk.columns.every((c) => byName.get(fk.table)!.columns.find((x) => x.name === c)?.nullable === true),
    }))
}

function colOf(m: TableMapping, name: string): MappedColumn {
  return m.columns.find((c) => c.name === name)!
}

// ---------------------------------------------------------------- pre-checks

async function sourceDataChecks(source: SourcePort, m: TableMapping, issues: Issue[], coverage: TimestampCoverage[], offsetHours: number): Promise<void> {
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
    }
    if (c.lengthLimit !== null) {
      checks.push({ code: "LENGTH_OVERFLOW", column: c.name, expr: `CHAR_LENGTH(${q}) > ${c.lengthLimit}`, severity: "error", message: `longer than ${c.lengthLimit} characters` })
    }
    if (c.nullCheck) {
      checks.push({ code: "NULL_IN_NOT_NULL", column: c.name, expr: `${q} IS NULL`, severity: "error", message: "NULL in a column that is NOT NULL in the target" })
    }
  }
  const ts = planTimestampProbes(m, offsetHours)
  coverage.push(...ts.coverage)
  for (const c of ts.checks) checks.push({ ...c, severity: "warning" })
  if (checks.length === 0) return
  const sums = checks.map((c, i) => `COALESCE(SUM(${c.expr}), 0) AS f${i}`).join(", ")
  const [counts] = await source.query(`${tag("scan", m.table)} SELECT ${sums} FROM ${t}`)
  for (let i = 0; i < checks.length; i++) {
    const raw = counts?.[`f${i}`]
    if (raw === undefined) throw new Error(`pre-check scan of ${m.table} returned no value for ${checks[i].code} ${checks[i].column}`)
    const n = Number(raw ?? 0)
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

async function jsonChecks(source: SourcePort, m: TableMapping, allowInvalidJson: boolean, issues: Issue[], records: InvalidJsonRecord[]): Promise<void> {
  for (const c of m.columns.filter((x) => x.kind === "json" || x.kind === "jsonb")) {
    const sql = `${tag("json", m.table)} SELECT ${[...m.primaryKey, c.name].map(myIdent).join(", ")} FROM ${myIdent(m.sourceTable)} WHERE ${myIdent(c.name)} IS NOT NULL`
    let count = 0
    const sample: string[] = []
    const mapped = allowInvalidJson && c.nullable
    for await (const row of source.stream(sql)) {
      try {
        toTargetText(row[c.name], c)
      } catch (e) {
        if (!(e instanceof ConversionError)) throw e
        count++
        const key = keyOf(row, m.primaryKey)
        if (sample.length < SAMPLE) sample.push(key)
        if (mapped) records.push({ table: m.table, column: c.name, key, original: String(row[c.name]) })
      }
    }
    if (count === 0) continue
    issues.push({
      code: "INVALID_JSON",
      severity: mapped ? "warning" : "error",
      table: m.table,
      column: c.name,
      count,
      sampleKeys: sample,
      message: mapped
        ? `${m.table}.${c.name}: ${count} invalid JSON value(s) will be copied as NULL (--allow-invalid-json; keys and originals in the --invalid-json-file)`
        : `${m.table}.${c.name}: ${count} value(s) are not valid JSON for PostgreSQL (unparsable or \\u0000)${c.nullable ? "; --allow-invalid-json copies them as NULL" : ""}`,
    })
  }
}

async function orphanChecks(source: SourcePort, schema: TargetSchema, tables: readonly TableMapping[], issues: Issue[]): Promise<void> {
  const byName = new Map(tables.map((t) => [t.table, t]))
  for (const fk of copiedForeignKeys(schema, tables)) {
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
  const fingerprint = makeValueHasher()
  const byName = new Map(tables.map((t) => [t.table, t]))
  for (const uk of citextUniqueKeys(schema)) {
    const m = byName.get(uk.table)
    // A key on a target-only column (--target-superset) cannot be read from the source: the INSERT enforces it.
    if (!m || !uk.columns.every((c) => m.columns.some((x) => x.name === c))) continue
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
      // Never the value itself (personal data): a short hash to group, plus the keys.
      sampleKeys: dups.slice(0, SAMPLE).map((d) => `value#${fingerprint(d.value)} <- ${d.keys.join(", ")}`),
      message: `${uk.name}: ${dups.length} value(s) collide case-insensitively (citext); resolve them in the source first (keys listed, values not printed)`,
    })
  }
}

async function targetChecks(target: TargetPort, schema: TargetSchema, tables: readonly TableMapping[], issues: Issue[], requireEmpty: boolean, locale: { localeProvider: string; icuLocale: string | null; encoding: string }): Promise<void> {
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
  if (locale.encoding.toUpperCase() !== "UTF8") {
    issues.push({ code: "TARGET_ENCODING", severity: "error", count: 1, sampleKeys: [], message: `target database encoding is ${locale.encoding}, expected UTF8` })
  }
  if (locale.localeProvider !== "icu" || locale.icuLocale !== "und") {
    issues.push({
      code: "TARGET_LOCALE",
      severity: "warning",
      count: 1,
      sampleKeys: [],
      message: `target locale is ${locale.localeProvider}/${locale.icuLocale ?? "-"}; the platform standard is ICU "und" (sort order differs)`,
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
  nulled: Set<string>,
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
    const sql = `${tag("copy", m.table)} SELECT ${select} FROM ${myIdent(m.sourceTable)} ${keysetMy(m.primaryKey, last, "WHERE")} ORDER BY ${pkOrderMy(m)} LIMIT ${opts.batchSize}`
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
          const r = sourceText(row[c.name], c, opts.allowInvalidJson)
          if (r.nulled) nulled.add(`${m.table}\u0001${c.name}\u0001${keyOf(row, m.primaryKey)}`)
          arrays[i].push(r.text)
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
  const notNull = fkCols.map((c) => `${myIdent(c)} IS NOT NULL`).join(" OR ")
  const all = [...pk, ...fkCols]
  const update =
    `${tag("deferred-update", m.table)} UPDATE ${pgIdent(m.table)} AS t SET ${fkCols.map((c, i) => `${pgIdent(c)} = u.f${i}::${colOf(m, c).pgType}`).join(", ")} ` +
    `FROM unnest(${all.map((_, i) => `$${i + 1}::text[]`).join(", ")}) AS u(${[...pk.map((_, i) => `k${i}`), ...fkCols.map((_, i) => `f${i}`)].join(", ")}) ` +
    `WHERE ${pk.map((k, i) => `t.${pgIdent(k)} = u.k${i}::${colOf(m, k).pgType}`).join(" AND ")}`
  let last: unknown[] | null = null
  let updated = 0
  for (;;) {
    const sql = `${tag("deferred", m.table)} SELECT ${all.map(myIdent).join(", ")} FROM ${myIdent(m.sourceTable)} WHERE (${notNull}) ${keysetMy(pk, last, "AND")} ORDER BY ${pkOrderMy(m)} LIMIT ${opts.batchSize}`
    const rows = await ports.source.query(sql, last ?? [])
    if (rows.length === 0) break
    const arrays = all.map((n) => rows.map((r) => toTargetText(r[n], colOf(m, n))))
    await ports.target.query(update, arrays)
    updated += rows.length
    const lastRow = rows[rows.length - 1]
    last = pk.map((k) => lastRow[k])
    if (rows.length < opts.batchSize) break
  }
  return updated
}

// ---------------------------------------------------------------- verify

function targetByKeysSql(m: TableMapping): string {
  const pk = m.primaryKey
  return (
    `${tag("verify-keys", m.table)} SELECT ${m.columns.map((c) => `t.${pgIdent(c.name)}`).join(", ")} FROM ${pgIdent(m.table)} AS t ` +
    `JOIN unnest(${pk.map((_, i) => `$${i + 1}::text[]`).join(", ")}) AS k(${pk.map((_, i) => `k${i}`).join(", ")}) ` +
    `ON ${pk.map((k, i) => `t.${pgIdent(k)} = k.k${i}::${colOf(m, k).pgType}`).join(" AND ")}`
  )
}

function canonKey(m: TableMapping, texts: readonly (string | null)[]): string {
  return formatKey(m.primaryKey.map((_, i) => canonicalValue(m.pkKinds[i], texts[i])))
}

async function verifyTable(ports: Ports, m: TableMapping, opts: RunOptions): Promise<TableComparison> {
  const kinds: TargetKind[] = m.columns.map((c) => c.kind)
  const pkIdx = m.primaryKey.map((k) => m.columns.findIndex((c) => c.name === k))
  const v = new TableVerifier(m.table)
  const [sc] = await ports.source.query(`${tag("verify-count", m.table)} SELECT COUNT(*) AS n FROM ${myIdent(m.sourceTable)}`)
  const [tc] = await ports.target.query(`${tag("verify-count", m.table)} SELECT COUNT(*) AS n FROM ${pgIdent(m.table)}`)
  const sourceRows = Number(sc?.n ?? NaN)
  const targetRows = Number(tc?.n ?? NaN)
  const byKeys = targetByKeysSql(m)
  let last: unknown[] | null = null
  for (;;) {
    const rows = await ports.source.query(
      `${tag("verify", m.table)} SELECT ${m.columns.map((c) => myIdent(c.name)).join(", ")} FROM ${myIdent(m.sourceTable)} ${keysetMy(m.primaryKey, last, "WHERE")} ORDER BY ${pkOrderMy(m)} LIMIT ${opts.batchSize}`,
      last ?? [],
    )
    if (rows.length === 0) break
    const chunk: VerifyRow[] = rows.map((row) => {
      const texts = m.columns.map((c) => {
        try {
          return sourceText(row[c.name], c, opts.allowInvalidJson).text
        } catch (e) {
          if (e instanceof ConversionError) return `!${e.code}`
          throw e
        }
      })
      return { key: canonKey(m, pkIdx.map((i) => texts[i])), canon: canonicalRow(kinds, texts) }
    })
    const keyArrays = m.primaryKey.map((k) => rows.map((r) => toTargetText(r[k], colOf(m, k))))
    const found = await ports.target.query(byKeys, keyArrays)
    const map = new Map<string, string>()
    for (const t of found) {
      const texts = m.columns.map((c) => t[c.name] ?? null)
      map.set(canonKey(m, pkIdx.map((i) => texts[i])), canonicalRow(kinds, texts))
    }
    v.addChunk(chunk, map)
    const lastRow = rows[rows.length - 1]
    last = m.primaryKey.map((k) => lastRow[k])
    if (rows.length < opts.batchSize) break
  }
  if (targetRows !== v.matched) await namedExtras(ports, m, v, opts)
  return v.result(sourceRows, targetRows)
}

/** Target keys without an exactly equal source key (only run when counts disagree). */
async function namedExtras(ports: Ports, m: TableMapping, v: TableVerifier, opts: RunOptions): Promise<void> {
  const pk = m.primaryKey
  let last: (string | null)[] | null = null
  for (;;) {
    const where = last === null ? "" : `WHERE (${pk.map((k) => pgIdent(k)).join(", ")}) > (${pk.map((k, i) => `$${i + 1}::${colOf(m, k).pgType}`).join(", ")})`
    const rows = await ports.target.query(
      `${tag("verify-extra", m.table)} SELECT ${pk.map((k) => pgIdent(k)).join(", ")} FROM ${pgIdent(m.table)} ${where} ORDER BY ${pk.map((k) => pgIdent(k)).join(", ")} LIMIT ${opts.batchSize}`,
      last ?? [],
    )
    if (rows.length === 0) break
    const placeholders = rows.map(() => `(${pk.map(() => "?").join(", ")})`).join(", ")
    const params = rows.flatMap((r) => pk.map((k) => r[k]))
    const present = await ports.source.query(
      `${tag("verify-extra", m.table)} SELECT ${pk.map(myIdent).join(", ")} FROM ${myIdent(m.sourceTable)} WHERE (${pk.map(myIdent).join(", ")}) IN (${placeholders})`,
      params,
    )
    const have = new Set(present.map((r) => canonKey(m, pk.map((k) => (r[k] === null ? null : String(r[k]))))))
    v.addExtras(rows.map((r) => canonKey(m, pk.map((k) => r[k] ?? null))).filter((k) => !have.has(k)))
    const lastRow = rows[rows.length - 1]
    last = pk.map((k) => lastRow[k] ?? null)
    if (rows.length < opts.batchSize) break
  }
}

async function verifySequences(ports: Ports, schema: TargetSchema, comparisons: TableComparison[], targetSuperset: boolean): Promise<void> {
  for (const s of schema.sequences) {
    const c = comparisons.find((x) => x.table === s.table)
    if (!c && targetSuperset) {
      // A target-only table (--target-superset) is not copied: it must still be empty.
      const [r] = await ports.target.query(`${tag("verify-seq", s.table)} SELECT COUNT(*)::text AS n FROM ${pgIdent(s.table)}`)
      if (String(r?.n ?? "0") !== "0") throw new Error(`target-only table ${s.table} holds rows: it was not copied and must be empty`)
      continue
    }
    // A sequence on a table that was not verified would be skipped silently: fail loudly instead.
    if (!c) throw new Error(`sequence ${s.sequence} belongs to table ${s.table}, which is not among the verified tables`)
    const [r] = await ports.target.query(
      `${tag("verify-seq", s.table)} SELECT (SELECT COALESCE(MAX(${pgIdent(s.column)}), 0) FROM ${pgIdent(s.table)})::text AS mx, last_value::text AS lv, is_called::text AS called FROM ${s.sequence.split(".").map(pgIdent).join(".")}`,
    )
    const next = r.called === "true" || r.called === "t" ? BigInt(r.lv ?? "0") + BigInt(1) : BigInt(r.lv ?? "0")
    if (next <= BigInt(r.mx ?? "0")) {
      c.match = false
      c.differenceCount++
      c.differences.push({ kind: "sequence-behind", key: `${s.sequence} next ${next} <= max ${r.mx}` })
    }
  }
}

async function verifyAll(ports: Ports, schema: TargetSchema, tables: readonly TableMapping[], opts: RunOptions, log: (l: string) => void): Promise<TableComparison[]> {
  const out: TableComparison[] = []
  for (const m of tables) {
    const c = await verifyTable(ports, m, opts)
    out.push(c)
  }
  await verifySequences(ports, schema, out, opts.targetSuperset === true)
  for (const c of out) {
    log(
      `[verify] ${c.table}: ${c.match ? "OK" : "MISMATCH"} source ${c.sourceRows} / target ${c.targetRows} rows, sha256 ${c.sourceHash.slice(0, 12)}${c.match ? "" : ` vs ${c.targetHash.slice(0, 12)}`}` +
        (c.differences.length > 0 ? `; first differences: ${c.differences.map((d) => `${d.kind} ${d.key}`).join("; ")}` : ""),
    )
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
    precheck: { errors: [], warnings: [], info: [] },
    acceptedWarnings: [],
    unacceptedWarnings: [],
    timestampAnalysis: [],
    sourceCounts: {},
    committed: false,
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
  let txOpen = false
  try {
    const issues: Issue[] = []
    const [srcSchema, tgtSchema, srcInfo, tgtInfo] = await phase("introspect", async () =>
      Promise.all([ports.source.introspect(), ports.target.introspect(), ports.source.serverInfo(), ports.target.serverInfo()]),
    )
    report.sourceServer = { ...srcInfo }
    report.targetServer = { ...tgtInfo }
    log(`[identity] source ${srcInfo.identity} / target ${tgtInfo.identity}`)
    if (opts.mode === "migrate") {
      const want = [
        ["source", opts.expectSourceIdentity, srcInfo.identity],
        ["target", opts.expectTargetIdentity, tgtInfo.identity],
      ] as const
      for (const [side, expected, actual] of want) {
        if (!expected || expected !== actual) {
          issues.push({
            code: "IDENTITY_MISMATCH",
            severity: "error",
            count: 1,
            sampleKeys: [],
            message: `${side} server identity ${actual} does not equal --${side}-identity ${expected ?? "(missing)"} recorded at the dry run: a different server / database than the one checked`,
          })
        }
      }
    }
    if ((opts.denyTargetIdentities ?? []).includes(tgtInfo.identity)) {
      issues.push({ code: "IDENTITY_MISMATCH", severity: "error", count: 1, sampleKeys: [], message: `target server identity ${tgtInfo.identity} is on the deny list (id: entry)` })
    }
    if (srcInfo.charset !== "utf8mb4") {
      issues.push({ code: "SOURCE_CHARSET", severity: "warning", count: 1, sampleKeys: [], message: `source database default charset is ${srcInfo.charset}, production uses utf8mb4` })
    }
    const compat = checkSchemaCompat(srcSchema, tgtSchema, { targetSuperset: opts.targetSuperset === true })
    issues.push(...compat.issues)
    const tables = compat.tables
    if (tables.length === 0) {
      issues.push({ code: "NO_TABLES", severity: "error", count: 1, sampleKeys: [], message: "no table maps between source and target: nothing would be copied or verified" })
    }

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
    const invalidJson: InvalidJsonRecord[] = []
    await phase("precheck", async () => {
      await targetChecks(ports.target, tgtSchema, ordered, issues, opts.mode !== "verify-only", tgtInfo)
      if (opts.mode === "verify-only") return
      for (const m of ordered) {
        await sourceDataChecks(ports.source, m, issues, report.timestampAnalysis, opts.localOffsetHours ?? 7)
        await jsonChecks(ports.source, m, opts.allowInvalidJson, issues, invalidJson)
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
    report.precheck.info = issues.filter((i) => i.severity === "info")
    for (const i of issues) log(`[precheck] ${i.severity.toUpperCase()} ${i.code} ${i.message}${i.sampleKeys.length > 0 ? ` - keys: ${i.sampleKeys.join(" | ")}` : ""}`)
    if (opts.mode !== "verify-only") {
      const cov = report.timestampAnalysis
      const probed = cov.filter((c) => c.probes.length > 0).length
      const partial = cov.filter((c) => c.probes.length > 0 && c.notProbed.length > 0).length
      const none = cov.filter((c) => c.probes.length === 0).length
      log(`[precheck] timestamp analysis: ${cov.length} column(s); ${probed} probed (${partial} only partially), ${none} not probed (business dates) - details: report.timestampAnalysis`)
    }

    // Warning decision: nothing that needs a human judgement may end as a plain success.
    const accepted = new Set(opts.acceptWarnings ?? [])
    const isAccepted = (w: Issue): boolean => (w.code === "INVALID_JSON" ? opts.allowInvalidJson : (ACCEPTABLE_WARNINGS as readonly string[]).includes(w.code) && accepted.has(w.code))
    const decision = opts.mode === "verify-only" ? [] : report.precheck.warnings
    report.acceptedWarnings = decision.filter(isAccepted).map((w) => ({ code: w.code, count: w.count, table: w.table, column: w.column }))
    report.unacceptedWarnings = [...new Set(decision.filter((w) => !isAccepted(w)).map((w) => w.code))]

    const totalRows = Object.values(report.sourceCounts).reduce((a, b) => a + b, 0)
    log(
      `[precheck] ${ordered.length} tables, ${totalRows} source rows, ${report.precheck.errors.length} error(s), ${report.precheck.warnings.length} warning(s)` +
        (report.unacceptedWarnings.length > 0 ? `; needing a decision: ${report.unacceptedWarnings.join(",")}` : ""),
    )
    if (report.precheck.errors.length > 0 || plan === null) {
      await ports.source.endSnapshot()
      snapshotOpen = false
      return finish("precheck-failed", EXIT.refused)
    }
    if (opts.mode === "dry-run") {
      await ports.source.endSnapshot()
      snapshotOpen = false
      log("[dry-run] no writes performed")
      log(`[dry-run] for the migrate run against these servers: --source-identity ${srcInfo.identity} --target-identity ${tgtInfo.identity}`)
      if (report.unacceptedWarnings.length > 0) {
        log(`[dry-run] review the warnings above; a migrate run needs --accept-warnings ${report.unacceptedWarnings.join(",")}`)
        return finish("needs-decision", EXIT.needsDecision)
      }
      return finish("ok", EXIT.ok)
    }
    if (opts.mode === "migrate" && report.unacceptedWarnings.length === 0 && report.acceptedWarnings.some((w) => w.code !== "INVALID_JSON")) {
      const reviewed = report.precheck.warnings.filter((w) => w.code !== "INVALID_JSON")
      const problems = opts.warningBaseline
        ? checkWarningBaseline(reviewed, opts.warningBaseline, srcInfo.identity)
        : ["accepting warnings needs the reviewed dry run's report (--dry-run-report)"]
      if (problems.length > 0) {
        for (const p of problems) log(`[precheck] REFUSED: ${p}`)
        report.unacceptedWarnings = [...new Set(reviewed.map((w) => w.code))]
        await ports.source.endSnapshot()
        snapshotOpen = false
        return finish("precheck-failed", EXIT.refused)
      }
    }
    if (opts.mode === "migrate" && report.unacceptedWarnings.length > 0) {
      log(`[precheck] REFUSED: warnings need an explicit decision after review: --accept-warnings ${report.unacceptedWarnings.join(",")}`)
      await ports.source.endSnapshot()
      snapshotOpen = false
      return finish("precheck-failed", EXIT.refused)
    }

    if (opts.mode === "verify-only") {
      await ports.source.endSnapshot()
      snapshotOpen = false
      const vStart = Date.now()
      await ports.source.beginSnapshot()
      snapshotOpen = true
      await ports.target.begin(true)
      txOpen = true
      const comparisons = await verifyAll(ports, tgtSchema, ordered, opts, log)
      await ports.target.commit()
      txOpen = false
      await ports.source.endSnapshot()
      snapshotOpen = false
      const mismatched = comparisons.filter((c) => !c.match).map((c) => c.table)
      report.verification = { tables: comparisons, mismatched, insideTransaction: false, ms: Date.now() - vStart }
      timings.verify = report.verification.ms
      log(mismatched.length === 0 ? `[verify] all ${comparisons.length} tables match` : `[verify] MISMATCH in ${mismatched.length} table(s): ${mismatched.join(", ")}`)
      return finish(mismatched.length === 0 ? "ok" : "verify-failed", mismatched.length === 0 ? EXIT.ok : EXIT.verifyFailed)
    }

    // ---- migrate
    if (invalidJson.length > 0) {
      if (!hooks.onInvalidJsonNulled) throw new MigratorError("SIDE_FILE", "invalid JSON would be nulled but no side file writer is configured")
      await hooks.onInvalidJsonNulled(invalidJson)
    }
    const copyStart = Date.now()
    const deferredBy = new Map<string, Set<string>>()
    for (const e of plan.deferred) deferredBy.set(e.table, new Set([...(deferredBy.get(e.table) ?? []), ...e.columns]))
    const copied: { table: string; rows: number; ms: number }[] = []
    let deferredUpdates = 0
    const sequencesReset: string[] = []
    const nulled = new Set<string>()
    await ports.target.begin(false)
    txOpen = true
    await ports.target.query(`${tag("lock")} LOCK TABLE ${ordered.map((t) => pgIdent(t.table)).join(", ")} IN ACCESS EXCLUSIVE MODE`)
    const raced = await nonEmptyTables(ports.target, ordered)
    if (raced.length > 0) throw new Error(`target tables became non-empty before the copy started: ${raced.join(", ")}`)
    for (const m of ordered) {
      const s = Date.now()
      const rows = await copyTable(ports, m, deferredBy.get(m.table) ?? new Set(), opts, report.sourceCounts[m.table], nulled, log)
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
    const expectedNulled = new Set(invalidJson.map((r) => `${r.table}\u0001${r.column}\u0001${r.key}`))
    if (nulled.size !== expectedNulled.size || [...nulled].some((k) => !expectedNulled.has(k))) {
      throw new Error(`the copy nulled ${nulled.size} invalid JSON value(s) but the pre-check listed ${expectedNulled.size}: source changed during the run?`)
    }
    report.copy = { tables: copied, deferredUpdates, sequencesReset, invalidJsonNulled: nulled.size, ms: Date.now() - copyStart }
    timings.copy = report.copy.ms
    log(`[copy] ${copied.reduce((a, b) => a + b.rows, 0)} rows written in ${report.copy.ms} ms (not committed yet)`)
    await hooks.afterCopy?.(ports.target)

    // Verify inside the transaction, against the same source snapshot the copy read.
    const vStart = Date.now()
    const comparisons = await verifyAll(ports, tgtSchema, ordered, opts, log)
    const mismatched = comparisons.filter((c) => !c.match).map((c) => c.table)
    report.verification = { tables: comparisons, mismatched, insideTransaction: true, ms: Date.now() - vStart }
    timings.verify = report.verification.ms
    if (mismatched.length > 0) {
      await ports.target.rollback()
      txOpen = false
      log(`[verify] MISMATCH in ${mismatched.length} table(s): ${mismatched.join(", ")} - ROLLED BACK, the target is empty`)
      await ports.source.endSnapshot()
      snapshotOpen = false
      return finish("verify-failed", EXIT.verifyFailed)
    }
    report.committed = "unknown"
    await ports.target.commit()
    txOpen = false
    report.committed = true
    log(`[verify] all ${comparisons.length} tables match - COMMITTED`)
    await ports.source.endSnapshot()
    snapshotOpen = false
    try {
      for (const m of ordered) await ports.target.query(`${tag("analyze", m.table)} ANALYZE ${pgIdent(m.table)}`)
      report.analyze = "ok"
    } catch (e) {
      report.analyze = "failed"
      log(`[analyze] failed (data is committed; run ANALYZE by hand): ${sanitizeError(e)}`)
    }
    return finish("ok", EXIT.ok)
  } catch (e) {
    report.error = sanitizeError(e)
    if (txOpen) {
      try {
        await ports.target.rollback()
        if (report.committed !== "unknown") report.committed = false
      } catch (re) {
        log(`[error] ROLLBACK failed too: ${sanitizeError(re)}`)
      }
    }
    // The source snapshot (if open) is NOT ended here: the connection may be stuck behind a
    // half-read stream. Closing the connection (connect.ts) ends it.
    if (snapshotOpen) log("[error] source snapshot left to the connection close")
    log(`[error] ${report.error}${report.committed === "unknown" ? " - COMMIT outcome unknown: run --verify-only before anything else" : ""}`)
    return finish("error", EXIT.error)
  }
}
