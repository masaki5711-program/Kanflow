/**
 * SYNTHETIC MySQL source for the K2 migrator rehearsal and integration tests.
 * Never point it at a real database: it refuses port 3306 (the production
 * MySQL) and any non-loopback host.
 *
 *   KANFLOW_SEED_MYSQL_PASSWORD=k2_app_synthetic \
 *   node --import tsx scripts/seed-mysql-synthetic.ts --target mysql://k2_app@127.0.0.1:23306/scrum_tool_synthetic \
 *     [--apply-schema] [--rows-per-table 6] [--seed 42] [--inject nul|invalid-json|case-dup]
 *
 * --apply-schema  replays the frozen MySQL migrations (prisma/migrations-mysql, the
 *                 schema production runs) into an EMPTY database first.
 * Rows: generated from the MySQL catalog, so every one of the 78 tables gets
 *   rows in FK order (parents first), unique keys respected, nullable FKs and
 *   self-references (trees) filled after the insert like real data. Values
 *   include Japanese / Indonesian / emoji / quotes / backslashes / newlines,
 *   max-length strings, 0.1 and 1e-300 doubles, NULL vs '' vs JSON null, and
 *   legacy local-time rows in field_translation (requested_at = translated_at + 7 h,
 *   one pending row ahead of UTC now).
 * --inject        adds ONE defect for a negative run:
 *   nul           a NUL byte in a text column
 *   invalid-json  "\u0000" inside the JSON column (valid for MySQL, rejected by jsonb)
 *   case-dup      two User.email values that utf8mb4_unicode_ci keeps apart but
 *                 citext treats as equal (U+023A / U+2C65)
 */
import fs from "node:fs"
import path from "node:path"
import mysql from "mysql2/promise"
import type { Connection, RowDataPacket } from "mysql2/promise"
import { parseEndpoint, type Endpoint } from "../src/lib/db-migrator/args"
import { normalizeHost } from "../src/lib/db-migrator/deny-list"
import { planCopyOrder, type FkEdge } from "../src/lib/db-migrator/order"
import { myIdent } from "../src/lib/db-migrator/sql"

export type Injection = "nul" | "invalid-json" | "case-dup"

interface Col {
  name: string
  dataType: string
  columnType: string
  nullable: boolean
  maxLength: number | null
  autoIncrement: boolean
}

interface Table {
  name: string
  cols: Col[]
  pk: string[]
}

interface Fk {
  name: string
  table: string
  columns: string[]
  refTable: string
  refColumns: string[]
}

// ------------------------------------------------------------ guards

/** Synthetic databases are named <anything>_synthetic; the production database (scrum_tool) never is. */
export const SYNTHETIC_DB = /_synthetic$/

export function assertSyntheticEndpoint(e: Endpoint): void {
  if (normalizeHost(e.host) !== "loopback") throw new Error(`refusing: ${e.host} is not a loopback host (synthetic containers only)`)
  if (e.port === 3306) throw new Error("refusing: port 3306 is the production MySQL port")
  if (!SYNTHETIC_DB.test(e.database)) throw new Error(`refusing: database ${e.database} is not named *_synthetic`)
}

/** After connecting: the server must agree that this is a synthetic database (not a tunnel to another one). */
export async function assertSyntheticServer(conn: Connection): Promise<void> {
  const [r] = await conn.query<RowDataPacket[]>("SELECT DATABASE() AS db")
  const db = String(r[0]?.db ?? "")
  if (!SYNTHETIC_DB.test(db)) throw new Error(`refusing: connected database ${db} is not named *_synthetic`)
}

// ------------------------------------------------------------ schema

export async function applyMysqlSchema(conn: Connection, migrationsDir: string): Promise<number> {
  const [existing] = await conn.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()")
  if (Number(existing[0].n) > 0) throw new Error("refusing --apply-schema: the database already has tables")
  const dirs = fs.readdirSync(migrationsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()
  let applied = 0
  for (const d of dirs) {
    const file = path.join(migrationsDir, d, "migration.sql")
    if (!fs.existsSync(file)) continue
    await conn.query(fs.readFileSync(file, "utf8"))
    applied++
  }
  return applied
}

export async function dropAllTables(conn: Connection): Promise<void> {
  const [rows] = await conn.query<RowDataPacket[]>("SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()")
  if (rows.length === 0) return
  await conn.query("SET FOREIGN_KEY_CHECKS = 0")
  for (const r of rows) await conn.query(`DROP TABLE ${myIdent(String(r.t))}`)
  await conn.query("SET FOREIGN_KEY_CHECKS = 1")
}

async function introspect(conn: Connection): Promise<{ tables: Table[]; fks: Fk[]; uniques: Map<string, string[][]> }> {
  const [cols] = await conn.query<RowDataPacket[]>(
    `SELECT TABLE_NAME AS t, COLUMN_NAME AS c, LOWER(DATA_TYPE) AS dt, LOWER(COLUMN_TYPE) AS ct, IS_NULLABLE AS n,
            CHARACTER_MAXIMUM_LENGTH AS ml, EXTRA AS x
     FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME, ORDINAL_POSITION`,
  )
  const [stats] = await conn.query<RowDataPacket[]>(
    `SELECT TABLE_NAME AS t, INDEX_NAME AS i, COLUMN_NAME AS c FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND NON_UNIQUE = 0 ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`,
  )
  const [keys] = await conn.query<RowDataPacket[]>(
    `SELECT CONSTRAINT_NAME AS name, TABLE_NAME AS t, COLUMN_NAME AS c, REFERENCED_TABLE_NAME AS rt, REFERENCED_COLUMN_NAME AS rc
     FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL
     ORDER BY CONSTRAINT_NAME, ORDINAL_POSITION`,
  )
  const tables = new Map<string, Table>()
  for (const r of cols) {
    const t = String(r.t)
    if (!tables.has(t)) tables.set(t, { name: t, cols: [], pk: [] })
    tables.get(t)!.cols.push({
      name: String(r.c),
      dataType: String(r.dt),
      columnType: String(r.ct),
      nullable: r.n === "YES",
      maxLength: r.ml === null ? null : Number(r.ml),
      autoIncrement: String(r.x).includes("auto_increment"),
    })
  }
  const uniques = new Map<string, string[][]>()
  const idx = new Map<string, string[]>()
  for (const r of stats) {
    const k = `${String(r.t)}\u0001${String(r.i)}`
    idx.set(k, [...(idx.get(k) ?? []), String(r.c)])
  }
  for (const [k, c] of idx) {
    const [t, i] = k.split("\u0001")
    if (i === "PRIMARY") tables.get(t)!.pk = c
    uniques.set(t, [...(uniques.get(t) ?? []), c])
  }
  const fkMap = new Map<string, Fk>()
  for (const r of keys) {
    const k = `${String(r.t)}.${String(r.name)}`
    if (!fkMap.has(k)) fkMap.set(k, { name: String(r.name), table: String(r.t), columns: [], refTable: String(r.rt), refColumns: [] })
    fkMap.get(k)!.columns.push(String(r.c))
    fkMap.get(k)!.refColumns.push(String(r.rc))
  }
  return { tables: [...tables.values()], fks: [...fkMap.values()], uniques }
}

// ------------------------------------------------------------ values

function prng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const TEXTS = [
  "Checkout flow",
  "受入基準のテストを書く",
  "Uji penerimaan untuk modul gudang",
  "Release 🚀 ✅ done",
  `Quotes ' " \` and a backslash \\ here`,
  "line one\nline two\ttabbed",
  "trailing space ",
  "MiXeD Case Value",
  "Ⱥ ⱥ ß İ ı — unicode case corners",
  "",
]
const DOUBLES = ["0.1", "1e-300", "12345.678", "-3.5", "0.3333333333333333", "100"]
const JSONS = ['["src/a.ts","docs/日本語.md"]', '{"b":1,"a":{"y":[1,2.5,null],"x":"🚀"}}', "null", "[]", '{"path":"C:\\\\temp\\\\x","n":-0.5}']

function cut(s: string, max: number | null): string {
  if (max === null) return s
  return Array.from(s).slice(0, max).join("")
}

function fmtDate(ms: number): string {
  return new Date(ms).toISOString().replace("T", " ").replace("Z", "")
}

class Gen {
  private readonly rnd: () => number
  private counter = 0

  constructor(seed: number) {
    this.rnd = prng(seed)
  }

  int(n: number): number {
    return Math.floor(this.rnd() * n)
  }

  pick<T>(list: readonly T[]): T {
    return list[this.int(list.length)]
  }

  chance(p: number): boolean {
    return this.rnd() < p
  }

  id(): string {
    let s = "c"
    for (let i = 0; i < 24; i++) s += "0123456789abcdefghijklmnopqrstuvwxyz"[this.int(36)]
    return s
  }

  next(): number {
    return ++this.counter
  }

  date(): string {
    const base = Date.UTC(2025, 0, 1)
    return fmtDate(base + this.int(600 * 86_400_000))
  }

  value(c: Col, unique: boolean): string | number | null {
    const n = unique ? `-${this.next()}` : ""
    switch (c.dataType) {
      case "tinyint":
        return c.columnType.startsWith("tinyint(1)") ? this.int(2) : this.int(100)
      case "int":
      case "bigint":
      case "smallint":
        return unique ? this.next() : this.int(1000)
      case "double":
      case "float":
        return this.pick(DOUBLES)
      case "datetime":
      case "timestamp":
        return this.date()
      case "json":
        return this.pick(JSONS)
      case "char": {
        if (c.maxLength === 2) return this.pick(["ja", "id", "en"])
        let h = ""
        for (let i = 0; i < (c.maxLength ?? 8); i++) h += "0123456789abcdef"[this.int(16)]
        return h
      }
      default: {
        const max = c.maxLength !== null && c.maxLength < 65535 ? c.maxLength : null
        if (/email/i.test(c.name)) return cut(`user${n || `-${this.next()}`}@example.test`, max)
        if (unique && max !== null && max <= 40) return cut(`${c.name}${n}`, max)
        // Fill some columns up to their bound (multi-byte at the end) to exercise lengths.
        if (max !== null && this.chance(0.1)) return cut(`${"x".repeat(max)}`, max - 2) + "日本"
        const base = this.pick(TEXTS)
        return cut(`${base}${n}`, max)
      }
    }
  }
}

// ------------------------------------------------------------ seed

export interface SeedResult {
  tables: number
  rows: number
  perTable: Record<string, number>
}

function lower(s: string): string {
  return s.toLowerCase()
}

export async function seedSynthetic(conn: Connection, opts: { rowsPerTable: number; seed: number }): Promise<SeedResult> {
  const g = new Gen(opts.seed)
  const { tables, fks, uniques } = await introspect(conn)
  const byName = new Map(tables.map((t) => [t.name, t]))
  const edges: FkEdge[] = fks.map((f) => ({
    ...f,
    nullable: f.columns.every((c) => byName.get(f.table)!.cols.find((x) => x.name === c)!.nullable),
  }))
  const plan = planCopyOrder(
    tables.map((t) => t.name),
    edges,
  )
  const deferredCols = new Map<string, Set<string>>()
  for (const e of plan.deferred) deferredCols.set(e.table, new Set([...(deferredCols.get(e.table) ?? []), ...e.columns]))
  // inserted rows per table (column -> value) for FK picks
  const inserted = new Map<string, Record<string, unknown>[]>()
  const perTable: Record<string, number> = {}
  await conn.query("SET SESSION time_zone = '+00:00'")

  for (const tname of plan.order) {
    const t = byName.get(tname)!
    const tFks = edges.filter((e) => e.table === tname && !plan.deferred.includes(e))
    const uniqueSets = (uniques.get(tname) ?? []).map((cols) => ({ cols, seen: new Set<string>() }))
    const uniqueCols = new Set((uniques.get(tname) ?? []).filter((u) => u.length === 1).flat())
    const rows: Record<string, unknown>[] = []
    const want = lower(tname) === "field_translation" ? opts.rowsPerTable + 4 : opts.rowsPerTable
    for (let i = 0, attempts = 0; i < want && attempts < want * 30; attempts++) {
      const row: Record<string, unknown> = {}
      let skip = false
      for (const fk of tFks) {
        const parents = inserted.get(fk.refTable) ?? []
        if (fk.nullable && (parents.length === 0 || g.chance(0.25))) {
          for (const c of fk.columns) row[c] = null
          continue
        }
        if (parents.length === 0) {
          skip = true
          break
        }
        const p = g.pick(parents)
        fk.columns.forEach((c, k) => {
          row[c] = p[fk.refColumns[k]]
        })
      }
      if (skip) break
      for (const c of t.cols) {
        if (c.name in row) continue
        if (deferredCols.get(tname)?.has(c.name)) {
          row[c.name] = null
          continue
        }
        if (c.autoIncrement) continue
        if (t.pk.length === 1 && t.pk[0] === c.name && c.dataType === "varchar") {
          row[c.name] = g.id()
          continue
        }
        const unique = uniqueCols.has(c.name)
        row[c.name] = c.nullable && !unique && g.chance(0.15) ? null : g.value(c, unique)
      }
      // Coherent event times: createdAt first, every other *At / *_at after it and never in the
      // 7 h +- 30 min local-offset window, so only the deliberate legacy rows below trip the
      // migrator's timestamp probes.
      const created = t.cols.find((c) => c.name === "createdAt" || c.name === "created_at")
      const base = Date.parse(`${g.date().replace(" ", "T")}Z`)
      for (const c of t.cols) {
        if ((c.dataType !== "datetime" && c.dataType !== "timestamp") || row[c.name] === null || row[c.name] === undefined) continue
        if (!/(At|_at)$/.test(c.name)) continue
        if (c === created) {
          row[c.name] = fmtDate(base)
          continue
        }
        let d = g.int(30 * 86_400_000)
        if (d > 6.5 * 3_600_000 && d < 7.5 * 3_600_000) d += 3_600_000
        row[c.name] = fmtDate(base + d)
      }
      // One legacy row: createdAt written by the database default in server local time (UTC+7),
      // updatedAt by Prisma in UTC -> updatedAt 7 h "before" createdAt.
      if (lower(tname) === "user" && i === 0 && created) {
        row[created.name] = fmtDate(base + 7 * 3_600_000)
        row.updatedAt = fmtDate(base)
      }
      // Legacy local-time rows (docs/operations/worker.md): requested_at written with NOW(3) at UTC+7.
      if (lower(tname) === "field_translation" && i < opts.rowsPerTable) {
        // Coherent UTC rows: requested <= started <= translated.
        row.status = g.pick(["done", "done", "pending", "failed"])
        const requested = Date.parse(`${g.date().replace(" ", "T")}Z`)
        row.requested_at = fmtDate(requested)
        row.started_at = row.status === "pending" ? null : fmtDate(requested + 1_000)
        row.translated_at = row.status === "done" ? fmtDate(requested + 2_000) : null
      }
      if (lower(tname) === "field_translation" && i >= opts.rowsPerTable) {
        const translated = Date.UTC(2026, 5, 1, 3, 0, 0, i)
        row.status = i === opts.rowsPerTable + 3 ? "pending" : "done"
        row.translated_at = row.status === "done" ? fmtDate(translated) : null
        row.started_at = row.status === "done" ? fmtDate(translated - 2_000) : null
        row.requested_at = row.status === "done" ? fmtDate(translated + 7 * 3_600_000) : fmtDate(Date.now() + 7 * 3_600_000)
      }
      const tuples = uniqueSets.map((u) => lower(JSON.stringify(u.cols.map((c) => row[c] ?? `\u0000null${g.next()}`))))
      if (uniqueSets.some((u, k) => u.seen.has(tuples[k]))) continue
      uniqueSets.forEach((u, k) => u.seen.add(tuples[k]))
      const names = Object.keys(row)
      const [res] = await conn.query<mysql.ResultSetHeader>(
        `INSERT INTO ${myIdent(tname)} (${names.map(myIdent).join(", ")}) VALUES (${names.map(() => "?").join(", ")})`,
        names.map((n) => row[n]),
      )
      const auto = t.cols.find((c) => c.autoIncrement)
      if (auto) row[auto.name] = res.insertId
      rows.push(row)
      i++
    }
    inserted.set(tname, rows)
    perTable[tname] = rows.length
  }

  // Deferred FKs (self-references / cycles): point at an EARLIER inserted row so trees stay
  // acyclic - with random ids a child's key often sorts before its parent's, which is
  // exactly what the migrator's two-phase copy has to handle.
  for (const e of plan.deferred) {
    const t = byName.get(e.table)!
    const rows = inserted.get(e.table) ?? []
    const parents = inserted.get(e.refTable) ?? []
    for (let i = 1; i < rows.length; i++) {
      if (!g.chance(0.6)) continue
      const p = e.table === e.refTable ? rows[g.int(i)] : g.pick(parents)
      if (!p) continue
      await conn.query(
        `UPDATE ${myIdent(e.table)} SET ${e.columns.map((c) => `${myIdent(c)} = ?`).join(", ")} WHERE ${t.pk.map((k) => `${myIdent(k)} = ?`).join(" AND ")}`,
        [...e.refColumns.map((c) => p[c]), ...t.pk.map((k) => rows[i][k])],
      )
    }
  }
  return { tables: tables.length, rows: Object.values(perTable).reduce((a, b) => a + b, 0), perTable }
}

async function tableNamed(conn: Connection, name: string): Promise<string> {
  const [rows] = await conn.query<RowDataPacket[]>(
    "SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = LOWER(?)",
    [name],
  )
  if (rows.length !== 1) throw new Error(`table ${name} not found`)
  return String(rows[0].t)
}

/** Adds one defect; returns the primary key(s) it touched and an undo that restores the old values. */
export async function injectDefect(conn: Connection, kind: Injection): Promise<{ keys: string[]; undo: () => Promise<void> }> {
  const firstIds = async (t: string, n: number): Promise<string[]> => {
    const [r] = await conn.query<RowDataPacket[]>(`SELECT id FROM ${myIdent(t)} ORDER BY id LIMIT ${n}`)
    return r.map((x) => String(x.id))
  }
  const setAndUndo = async (t: string, c: string, values: { id: string; value: string; asJson?: boolean }[]) => {
    const [old] = await conn.query<RowDataPacket[]>(
      `SELECT id, CAST(${myIdent(c)} AS CHAR) AS v FROM ${myIdent(t)} WHERE id IN (${values.map(() => "?").join(", ")})`,
      values.map((v) => v.id),
    )
    for (const v of values) {
      await conn.query(`UPDATE ${myIdent(t)} SET ${myIdent(c)} = ${v.asJson ? "CAST(? AS JSON)" : "?"} WHERE id = ?`, [v.value, v.id])
    }
    return async () => {
      for (const o of old) {
        await conn.query(`UPDATE ${myIdent(t)} SET ${myIdent(c)} = ${values[0].asJson && o.v !== null ? "CAST(? AS JSON)" : "?"} WHERE id = ?`, [o.v, o.id])
      }
    }
  }
  if (kind === "nul") {
    const t = await tableNamed(conn, "Project")
    const [id] = await firstIds(t, 1)
    return { keys: [id], undo: await setAndUndo(t, "description", [{ id, value: "before\u0000after" }]) }
  }
  if (kind === "invalid-json") {
    const [cols] = await conn.query<RowDataPacket[]>(
      "SELECT TABLE_NAME AS t, COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND DATA_TYPE = 'json' ORDER BY TABLE_NAME LIMIT 1",
    )
    const t = String(cols[0].t)
    const [id] = await firstIds(t, 1)
    return { keys: [id], undo: await setAndUndo(t, String(cols[0].c), [{ id, value: '["ok","nul\\u0000inside"]', asJson: true }]) }
  }
  const t = await tableNamed(conn, "User")
  const [a, b] = await firstIds(t, 2)
  const undo = await setAndUndo(t, "email", [
    { id: a, value: "\u023Alice.k2@example.test" },
    { id: b, value: "\u2C65lice.k2@example.test" },
  ])
  return { keys: [a, b], undo }
}

export async function openSeedConnection(endpoint: Endpoint, password: string): Promise<Connection> {
  assertSyntheticEndpoint(endpoint)
  const conn = await mysql.createConnection({
    host: endpoint.host,
    port: endpoint.port,
    user: endpoint.user,
    password,
    database: endpoint.database,
    charset: "UTF8MB4_UNICODE_CI",
    multipleStatements: true,
    connectTimeout: 10_000,
  })
  try {
    await assertSyntheticServer(conn)
  } catch (e) {
    conn.destroy()
    throw e
  }
  return conn
}

// ------------------------------------------------------------ CLI

async function main(argv: string[]): Promise<number> {
  let target: string | null = null
  let applySchema = false
  let rowsPerTable = 6
  let seed = 42
  let inject: Injection | null = null
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--target") target = argv[++i]
    else if (a === "--apply-schema") applySchema = true
    else if (a === "--rows-per-table") rowsPerTable = Number(argv[++i])
    else if (a === "--seed") seed = Number(argv[++i])
    else if (a === "--inject") inject = argv[++i] as Injection
    else {
      process.stderr.write(`unknown argument ${a}\n`)
      return 64
    }
  }
  if (!target || !Number.isInteger(rowsPerTable) || rowsPerTable < 1 || (inject && !["nul", "invalid-json", "case-dup"].includes(inject))) {
    process.stderr.write("usage: seed-mysql-synthetic.ts --target mysql://user@127.0.0.1:<port>/<db> [--apply-schema] [--rows-per-table n] [--seed n] [--inject nul|invalid-json|case-dup]\n")
    return 64
  }
  const password = process.env.KANFLOW_SEED_MYSQL_PASSWORD
  if (!password) {
    process.stderr.write("set KANFLOW_SEED_MYSQL_PASSWORD\n")
    return 64
  }
  const endpoint = parseEndpoint(target, "mysql", "--target")
  const conn = await openSeedConnection(endpoint, password)
  try {
    const t0 = Date.now()
    if (applySchema) {
      const n = await applyMysqlSchema(conn, path.resolve(__dirname, "..", "prisma", "migrations-mysql"))
      process.stdout.write(`applied ${n} frozen MySQL migrations in ${Date.now() - t0} ms\n`)
    }
    if (inject) {
      const { keys } = await injectDefect(conn, inject)
      process.stdout.write(`injected ${inject} at ${keys.join(", ")}\n`)
      return 0
    }
    const t1 = Date.now()
    const r = await seedSynthetic(conn, { rowsPerTable, seed })
    process.stdout.write(`seeded ${r.rows} synthetic rows into ${r.tables} tables in ${Date.now() - t1} ms\n`)
    return 0
  } finally {
    await conn.end()
  }
}

if (process.argv[1] && /seed-mysql-synthetic\.ts$/.test(process.argv[1])) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code
    })
    .catch((e: unknown) => {
      process.stderr.write(`seed failed: ${e instanceof Error ? e.message : String(e)}\n`)
      process.exitCode = 1
    })
}
