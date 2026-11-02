/**
 * Target port on pg.
 *
 * - every value comes back as PostgreSQL's TEXT output (all type parsers are
 *   the identity): verification compares what PostgreSQL stores, not what a
 *   driver turned it into;
 * - session: TimeZone=UTC, statement_timeout / lock_timeout bounded,
 *   application_name kanflow-k2-migrator; --dry-run / --verify-only connect with
 *   default_transaction_read_only=on so not even a bug can write;
 * - stream() uses a server-side cursor (FETCH in batches, bounded memory).
 */
import { Client } from "pg"
import { describeEndpoint, type Endpoint } from "./args"
import type { TargetPort, TargetRow, TargetServerInfo } from "./ports"
import type { TargetSchema, TargetTable } from "./schema"
import { tag } from "./sql"

const SCHEMA = "public"
const FETCH = 1000

export async function openPgTarget(endpoint: Endpoint, password: string, opts: { readOnly: boolean; statementTimeoutMs: number }): Promise<TargetPort> {
  const options = ["-c TimeZone=UTC", "-c lock_timeout=30000", opts.readOnly ? "-c default_transaction_read_only=on" : ""].filter(Boolean).join(" ")
  const client = new Client({
    host: endpoint.host,
    port: endpoint.port,
    user: endpoint.user,
    password,
    database: endpoint.database,
    application_name: "kanflow-k2-migrator",
    connectionTimeoutMillis: 10_000,
    statement_timeout: opts.statementTimeoutMs,
    query_timeout: opts.statementTimeoutMs + 5_000,
    options,
    types: { getTypeParser: () => (v: string | Buffer) => (typeof v === "string" ? v : v.toString("utf8")) },
  })
  let lastError: Error | null = null
  client.on("error", (e: Error) => {
    lastError = e
  })
  await client.connect()
  let cursorSeq = 0

  const query = async (sql: string, params: readonly unknown[] = []): Promise<TargetRow[]> => {
    if (lastError) throw lastError
    const r = await client.query(sql, params as unknown[])
    return r.rows as TargetRow[]
  }

  const port: TargetPort = {
    describe: () => describeEndpoint(endpoint),
    serverInfo: async (): Promise<TargetServerInfo> => {
      const [r] = await query(
        `${tag("server-info")} SELECT current_setting('server_version') AS v, pg_encoding_to_char(d.encoding) AS enc,
           CASE d.datlocprovider WHEN 'i' THEN 'icu' WHEN 'c' THEN 'libc' ELSE d.datlocprovider::text END AS p,
           COALESCE(to_jsonb(d) ->> 'daticulocale', to_jsonb(d) ->> 'datlocale') AS icu
         FROM pg_database d WHERE d.datname = current_database()`,
      )
      return { version: String(r.v), encoding: String(r.enc), localeProvider: String(r.p), icuLocale: r.icu }
    },
    introspect: async (): Promise<TargetSchema> => {
      const cols = await query(
        `${tag("introspect")} SELECT c.relname AS t, a.attname AS c, ty.typname, ty.typtype, format_type(a.atttypid, a.atttypmod) AS fmt, a.attnotnull AS nn,
           CASE WHEN ty.typname IN ('varchar', 'bpchar') AND a.atttypmod > 4 THEN a.atttypmod - 4 END AS ml
         FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
         JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
         JOIN pg_type ty ON ty.oid = a.atttypid
         WHERE ns.nspname = $1 AND c.relkind IN ('r', 'p') ORDER BY c.relname, a.attnum`,
        [SCHEMA],
      )
      const idx = await query(
        `${tag("introspect")} SELECT c.relname AS t, i.relname AS name, x.indisprimary AS pk, a.attname AS col
         FROM pg_index x JOIN pg_class c ON c.oid = x.indrelid JOIN pg_class i ON i.oid = x.indexrelid
         JOIN pg_namespace ns ON ns.oid = c.relnamespace
         CROSS JOIN LATERAL unnest(x.indkey::int2[]) WITH ORDINALITY AS k(attnum, ord)
         JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum
         WHERE ns.nspname = $1 AND (x.indisprimary OR x.indisunique) AND x.indexprs IS NULL AND x.indpred IS NULL
         ORDER BY c.relname, i.relname, k.ord`,
        [SCHEMA],
      )
      const fks = await query(
        `${tag("introspect")} SELECT con.conname AS name, c.relname AS t, r.relname AS rt, a.attname AS col, ra.attname AS rcol
         FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid JOIN pg_class r ON r.oid = con.confrelid
         JOIN pg_namespace ns ON ns.oid = c.relnamespace
         CROSS JOIN LATERAL unnest(con.conkey, con.confkey) WITH ORDINALITY AS k(att, ratt, ord)
         JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.att
         JOIN pg_attribute ra ON ra.attrelid = r.oid AND ra.attnum = k.ratt
         WHERE con.contype = 'f' AND ns.nspname = $1 ORDER BY con.conname, k.ord`,
        [SCHEMA],
      )
      const seqs = await query(
        `${tag("introspect")} SELECT * FROM (
           SELECT c.relname AS t, a.attname AS c, pg_get_serial_sequence(format('%I.%I', ns.nspname, c.relname), a.attname) AS seq
           FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
           JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
           WHERE ns.nspname = $1 AND c.relkind IN ('r', 'p')) s WHERE seq IS NOT NULL ORDER BY t, c`,
        [SCHEMA],
      )
      const [present] = await query(`${tag("introspect")} SELECT to_regclass($1) IS NOT NULL AS ok`, [`${SCHEMA}._prisma_migrations`])
      const migrations =
        present.ok === "t"
          ? await query(
              `${tag("introspect")} SELECT migration_name AS name, finished_at IS NOT NULL AS fin, rolled_back_at IS NOT NULL AS rb FROM ${SCHEMA}."_prisma_migrations" ORDER BY started_at`,
            )
          : []

      const tables = new Map<string, TargetTable>()
      for (const r of cols) {
        const t = String(r.t)
        if (!tables.has(t)) tables.set(t, { name: t, columns: [], primaryKey: [] })
        tables.get(t)!.columns.push({
          name: String(r.c),
          typname: String(r.typname),
          typtype: String(r.typtype),
          pgType: String(r.fmt),
          nullable: r.nn !== "t",
          maxLength: r.ml === null ? null : Number(r.ml),
          isCitext: r.typname === "citext",
        })
      }
      const uniques = new Map<string, { name: string; table: string; columns: string[] }>()
      for (const r of idx) {
        const t = String(r.t)
        if (r.pk === "t") {
          tables.get(t)?.primaryKey.push(String(r.col))
          continue
        }
        const k = `${t}.${String(r.name)}`
        if (!uniques.has(k)) uniques.set(k, { name: String(r.name), table: t, columns: [] })
        uniques.get(k)!.columns.push(String(r.col))
      }
      const foreignKeys = new Map<string, { name: string; table: string; columns: string[]; refTable: string; refColumns: string[] }>()
      for (const r of fks) {
        const k = `${String(r.t)}.${String(r.name)}`
        if (!foreignKeys.has(k)) foreignKeys.set(k, { name: String(r.name), table: String(r.t), columns: [], refTable: String(r.rt), refColumns: [] })
        foreignKeys.get(k)!.columns.push(String(r.col))
        foreignKeys.get(k)!.refColumns.push(String(r.rcol))
      }
      return {
        tables: [...tables.values()],
        uniqueKeys: [...uniques.values()],
        foreignKeys: [...foreignKeys.values()],
        sequences: seqs.map((r) => ({ table: String(r.t), column: String(r.c), sequence: String(r.seq) })),
        migrations: migrations.map((r) => ({ name: String(r.name), finished: r.fin === "t", rolledBack: r.rb === "t" })),
      }
    },
    query,
    stream: async function* (sql: string, params: readonly unknown[] = []) {
      const name = `k2_cursor_${++cursorSeq}`
      await query(`DECLARE ${name} NO SCROLL CURSOR FOR ${sql}`, params)
      try {
        for (;;) {
          const rows = await query(`FETCH FORWARD ${FETCH} FROM ${name}`)
          if (rows.length === 0) break
          for (const r of rows) yield r
        }
      } finally {
        await query(`CLOSE ${name}`)
      }
    },
    begin: async (readOnly: boolean) => {
      if (!readOnly && opts.readOnly) throw new Error("write transaction requested on a read-only (dry-run / verify-only) connection")
      await query(readOnly ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN ISOLATION LEVEL READ COMMITTED READ WRITE")
    },
    commit: async () => {
      await query("COMMIT")
    },
    rollback: async () => {
      await query("ROLLBACK")
    },
    close: async () => {
      await client.end()
    },
  }
  return port
}
