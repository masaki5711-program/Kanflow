/**
 * Pre-checks: everything that would make the copy fail or change data is
 * found BEFORE the first write, with the offending keys listed.
 *
 * Errors (abort, exit 2):
 *   SCHEMA_*                 table / column sets or types do not map 1:1
 *   NO_PRIMARY_KEY           keyset batching and verification need one
 *   TARGET_NOT_MIGRATED      _prisma_migrations missing / a migration not finished
 *   TARGET_NOT_EMPTY         any row in any application table (no override exists)
 *   TARGET_ENCODING          target database is not UTF8
 *   NUL_BYTE                 0x00 in a string (PostgreSQL text cannot hold it)
 *   INVALID_JSON             unparsable JSON or \u0000 in JSON for a json/jsonb column
 *                            (a warning instead with --allow-invalid-json: copied as NULL)
 *   BOOLEAN_DOMAIN           tinyint(1) value other than 0 / 1
 *   INVALID_DATETIME         zero dates ('0000-00-00 ...')
 *   LENGTH_OVERFLOW          longer than the target's varchar(n)
 *   NULL_IN_NOT_NULL         NULL where the target column is NOT NULL
 *   ORPHAN_FK                FK value without an exactly (byte-) equal parent - MySQL's
 *                            _ci FK matching accepts 'ABC' -> 'abc', PostgreSQL does not
 *   CITEXT_DUPLICATE         values that collide under citext in a unique key
 *   FK_CYCLE_UNBREAKABLE     see order.ts
 * Warnings (reported, never "fixed"):
 *   FUTURE_TIMESTAMP         write timestamp (createdAt / updatedAt / requested_at) more than
 *                            10 min ahead of UTC now: a local-time write (planning dates are not probed)
 *   LOCAL_TIME_SUSPECT       field_translation.requested_at later than its own
 *                            translated_at / started_at + 1 h: written in server local
 *                            time (UTC+7) by builds before 2026-10 (docs/operations/worker.md)
 *   SOURCE_CHARSET / TARGET_LOCALE / SOURCE_TABLE_NAME_CASE
 */
import { targetKindOf, type ColumnMapping, type TargetKind } from "./convert"
import { EXCLUDED_TABLES, type SourceSchema, type SourceTable, type TargetSchema, type TargetTable, type TargetUniqueKey } from "./schema"

export type IssueCode =
  | "SCHEMA_TABLE_MISSING_IN_TARGET"
  | "SCHEMA_TABLE_MISSING_IN_SOURCE"
  | "SCHEMA_COLUMN_MISMATCH"
  | "SCHEMA_TYPE_INCOMPATIBLE"
  | "NO_PRIMARY_KEY"
  | "TARGET_NOT_MIGRATED"
  | "TARGET_NOT_EMPTY"
  | "TARGET_ENCODING"
  | "TARGET_LOCALE"
  | "SOURCE_CHARSET"
  | "SOURCE_TABLE_NAME_CASE"
  | "NUL_BYTE"
  | "INVALID_JSON"
  | "BOOLEAN_DOMAIN"
  | "INVALID_DATETIME"
  | "LENGTH_OVERFLOW"
  | "NULL_IN_NOT_NULL"
  | "ORPHAN_FK"
  | "CITEXT_DUPLICATE"
  | "FK_CYCLE_UNBREAKABLE"
  | "FUTURE_TIMESTAMP"
  | "LOCAL_TIME_SUSPECT"

export interface Issue {
  code: IssueCode
  severity: "error" | "warning"
  table?: string
  column?: string
  count: number
  sampleKeys: string[]
  message: string
}

export interface MappedColumn extends ColumnMapping {
  /** target varchar(n)/char(n) bound tighter than the source's: check CHAR_LENGTH */
  lengthLimit: number | null
  /** target NOT NULL, source nullable: check for NULLs */
  nullCheck: boolean
  isCitext: boolean
}

export interface TableMapping {
  /** name in PostgreSQL (and in reports) */
  table: string
  /** name in MySQL (lower case when lower_case_table_names=1) */
  sourceTable: string
  columns: MappedColumn[]
  primaryKey: string[]
  pkKinds: TargetKind[]
}

const COMPATIBLE: Record<string, readonly TargetKind[]> = {
  tinyint: ["boolean", "integer"],
  smallint: ["integer"],
  mediumint: ["integer"],
  int: ["integer"],
  bigint: ["integer"],
  year: ["integer"],
  float: ["float"],
  double: ["float"],
  decimal: ["numeric", "float"],
  varchar: ["text", "char", "enum", "json", "jsonb"],
  char: ["text", "char", "enum", "json", "jsonb"],
  tinytext: ["text", "char", "enum", "json", "jsonb"],
  text: ["text", "char", "enum", "json", "jsonb"],
  mediumtext: ["text", "char", "enum", "json", "jsonb"],
  longtext: ["text", "char", "enum", "json", "jsonb"],
  enum: ["text", "enum"],
  set: ["text"],
  datetime: ["timestamp", "timestamptz"],
  timestamp: ["timestamp", "timestamptz"],
  date: ["date", "timestamp"],
  json: ["json", "jsonb", "text"],
  binary: ["bytea"],
  varbinary: ["bytea"],
  tinyblob: ["bytea"],
  blob: ["bytea"],
  mediumblob: ["bytea"],
  longblob: ["bytea"],
}

function issue(code: IssueCode, message: string, extra: Partial<Issue> = {}): Issue {
  return { code, severity: "error", count: 1, sampleKeys: [], message, ...extra }
}

function sourceTableFor(target: TargetTable, byExact: Map<string, SourceTable>, byLower: Map<string, SourceTable[]>): SourceTable | null {
  const exact = byExact.get(target.name)
  if (exact) return exact
  const lower = byLower.get(target.name.toLowerCase()) ?? []
  return lower.length === 1 ? lower[0] : null
}

export function checkSchemaCompat(source: SourceSchema, target: TargetSchema): { issues: Issue[]; mappings: Map<string, MappedColumn[]>; tables: TableMapping[] } {
  const issues: Issue[] = []
  const mappings = new Map<string, MappedColumn[]>()
  const tables: TableMapping[] = []
  const srcTables = source.tables.filter((t) => !EXCLUDED_TABLES.has(t.name.toLowerCase()))
  const byExact = new Map(srcTables.map((t) => [t.name, t]))
  const byLower = new Map<string, SourceTable[]>()
  for (const t of srcTables) byLower.set(t.name.toLowerCase(), [...(byLower.get(t.name.toLowerCase()) ?? []), t])
  const used = new Set<string>()
  let caseFolded = 0

  for (const tt of target.tables.filter((t) => !EXCLUDED_TABLES.has(t.name))) {
    const st = sourceTableFor(tt, byExact, byLower)
    if (!st) {
      issues.push(issue("SCHEMA_TABLE_MISSING_IN_SOURCE", `target table ${tt.name} has no source table`, { table: tt.name }))
      continue
    }
    used.add(st.name)
    if (st.name !== tt.name) caseFolded++
    const srcCols = new Map(st.columns.map((c) => [c.name, c]))
    const tgtNames = new Set(tt.columns.map((c) => c.name))
    const missing = tt.columns.filter((c) => !srcCols.has(c.name)).map((c) => c.name)
    const extra = st.columns.filter((c) => !tgtNames.has(c.name)).map((c) => c.name)
    if (missing.length > 0 || extra.length > 0) {
      issues.push(
        issue("SCHEMA_COLUMN_MISMATCH", `${tt.name}: columns missing in source [${missing.join(", ")}], missing in target [${extra.join(", ")}]`, { table: tt.name }),
      )
      continue
    }
    if (tt.primaryKey.length === 0 || st.primaryKey.length === 0 || tt.primaryKey.join(",") !== st.primaryKey.join(",")) {
      issues.push(issue("NO_PRIMARY_KEY", `${tt.name}: primary keys differ or are missing (source [${st.primaryKey}], target [${tt.primaryKey}])`, { table: tt.name }))
      continue
    }
    const cols: MappedColumn[] = []
    let ok = true
    for (const tc of tt.columns) {
      const sc = srcCols.get(tc.name)!
      const kind = targetKindOf(tc.typname, tc.typtype)
      const allowed = COMPATIBLE[sc.dataType] ?? []
      const boolOk = kind !== "boolean" || sc.columnType.startsWith("tinyint(1)")
      if (kind === null || !allowed.includes(kind) || !boolOk) {
        issues.push(
          issue("SCHEMA_TYPE_INCOMPATIBLE", `${tt.name}.${tc.name}: source ${sc.columnType} cannot be copied into ${tc.pgType}`, { table: tt.name, column: tc.name }),
        )
        ok = false
        continue
      }
      cols.push({
        name: tc.name,
        kind,
        pgType: tc.pgType,
        sourceType: sc.dataType,
        sourceColumnType: sc.columnType,
        nullable: tc.nullable,
        lengthLimit: tc.maxLength !== null && (sc.maxLength === null || sc.maxLength > tc.maxLength) ? tc.maxLength : null,
        nullCheck: !tc.nullable && sc.nullable,
        isCitext: tc.isCitext,
      })
    }
    if (!ok) continue
    mappings.set(tt.name, cols)
    tables.push({
      table: tt.name,
      sourceTable: st.name,
      columns: cols,
      primaryKey: tt.primaryKey,
      pkKinds: tt.primaryKey.map((k) => cols.find((c) => c.name === k)!.kind),
    })
  }
  for (const st of srcTables) {
    if (!used.has(st.name)) {
      issues.push(issue("SCHEMA_TABLE_MISSING_IN_TARGET", `source table ${st.name} has no target table (its rows would be lost)`, { table: st.name }))
    }
  }
  if (caseFolded > 0) {
    issues.push(
      issue("SOURCE_TABLE_NAME_CASE", `${caseFolded} source table(s) matched case-insensitively (MySQL lower_case_table_names)`, {
        severity: "warning",
        count: caseFolded,
      }),
    )
  }
  return { issues, mappings, tables }
}

/** Unique keys (PK excluded) that contain a citext column - the 5 + 2 keys of the Kanflow schema. */
export function citextUniqueKeys(schema: Pick<TargetSchema, "tables" | "uniqueKeys">): TargetUniqueKey[] {
  const citext = new Set<string>()
  for (const t of schema.tables) for (const c of t.columns) if (c.isCitext) citext.add(`${t.name}.${c.name}`)
  return schema.uniqueKeys.filter((k) => k.columns.some((c) => citext.has(`${k.table}.${c}`)))
}

/**
 * Collects (key -> row keys) under citext semantics: citext columns lower-cased
 * (JavaScript's Unicode default lower-casing, which matches PostgreSQL lower()
 * under the ICU "und" collation of the target cluster), other columns exact.
 * Tuples with a NULL are skipped (PostgreSQL unique indexes allow repeated NULLs).
 * Memory grows with the rows of the scanned table - only the small citext-keyed
 * tables (users, sections, categories, checklist labels, release tags) are scanned.
 */
export class CitextDuplicateFinder {
  private readonly seen = new Map<string, string[]>()

  constructor(private readonly citextMask: readonly boolean[]) {}

  add(rowKey: string, values: readonly (string | null)[]): void {
    if (values.some((v) => v === null)) return
    const norm = values.map((v, i) => (this.citextMask[i] ? (v as string).toLowerCase() : (v as string)))
    const k = norm.length === 1 ? norm[0] : JSON.stringify(norm)
    const list = this.seen.get(k)
    if (list) list.push(rowKey)
    else this.seen.set(k, [rowKey])
  }

  duplicates(): { value: string; keys: string[] }[] {
    return [...this.seen.entries()].filter(([, keys]) => keys.length > 1).map(([value, keys]) => ({ value, keys }))
  }
}
