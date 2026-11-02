/**
 * Source port on mysql2 (the MySQL client already in the lockfile through
 * prisma; K1 removed the mariadb driver with the MySQL provider).
 *
 * - every value is returned as TEXT exactly as MySQL prints it (JSON as UTF-8
 *   text, binary columns as Buffer): no Date / Number / JSON.parse in the driver;
 * - session: time_zone '+00:00', utf8mb4, REPEATABLE READ; reads run inside
 *   START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY (no lock, no write);
 * - connect timeout 10 s, every statement bounded by statementTimeoutMs.
 * A read-only account is enough (GRANT SELECT ON <db>.*; see the cutover runbook).
 */
import mysql from "mysql2"
import type { Connection, TypeCast } from "mysql2"
import { describeEndpoint, type Endpoint } from "./args"
import type { SourcePort, SourceRow, SourceServerInfo } from "./ports"
import type { SourceSchema, SourceTable } from "./schema"
import { tag } from "./sql"

const BINARY_TYPES = new Set(["binary", "varbinary", "tinyblob", "blob", "mediumblob", "longblob"])

export async function openMysqlSource(endpoint: Endpoint, password: string, statementTimeoutMs: number): Promise<SourcePort> {
  const binaryColumns = new Set<string>()
  const typeCast: TypeCast = (field, next) => {
    if (field.type === "JSON") return field.string("utf8")
    if (binaryColumns.has(`${field.table}.${field.name}`)) return field.buffer()
    if (field.type === "GEOMETRY") return next()
    return field.string()
  }
  const conn: Connection = mysql.createConnection({
    host: endpoint.host,
    port: endpoint.port,
    user: endpoint.user,
    password,
    database: endpoint.database,
    charset: "UTF8MB4_UNICODE_CI",
    timezone: "Z",
    connectTimeout: 10_000,
    supportBigNumbers: true,
    bigNumberStrings: true,
    dateStrings: true,
    multipleStatements: false,
    typeCast,
  })
  let lastError: Error | null = null
  conn.on("error", (e: Error) => {
    lastError = e
  })
  const p = conn.promise()
  const query = async (sql: string, params: readonly unknown[] = []): Promise<SourceRow[]> => {
    if (lastError) throw lastError
    const [rows] = await p.query({ sql, values: params as unknown[], timeout: statementTimeoutMs })
    return rows as SourceRow[]
  }
  await p.connect()
  await query("SET SESSION time_zone = '+00:00'")
  await query("SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ")

  const port: SourcePort = {
    describe: () => describeEndpoint(endpoint),
    serverInfo: async (): Promise<SourceServerInfo> => {
      const [r] = await query(
        `${tag("server-info")} SELECT VERSION() AS v, @@character_set_database AS cs, @@collation_database AS co, @@lower_case_table_names AS l`,
      )
      return { version: String(r.v), charset: String(r.cs), collation: String(r.co), lowerCaseTableNames: Number(r.l) }
    },
    introspect: async (): Promise<SourceSchema> => {
      const cols = await query(
        `${tag("introspect")} SELECT c.TABLE_NAME AS t, c.COLUMN_NAME AS c, LOWER(c.DATA_TYPE) AS dt, LOWER(c.COLUMN_TYPE) AS ct, c.IS_NULLABLE AS n, c.CHARACTER_MAXIMUM_LENGTH AS ml
         FROM information_schema.COLUMNS c JOIN information_schema.TABLES t ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME
         WHERE c.TABLE_SCHEMA = DATABASE() AND t.TABLE_TYPE = 'BASE TABLE' ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION`,
      )
      const pks = await query(
        `${tag("introspect")} SELECT TABLE_NAME AS t, COLUMN_NAME AS c FROM information_schema.KEY_COLUMN_USAGE
         WHERE TABLE_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'PRIMARY' ORDER BY TABLE_NAME, ORDINAL_POSITION`,
      )
      const tables = new Map<string, SourceTable>()
      for (const r of cols) {
        const t = String(r.t)
        if (!tables.has(t)) tables.set(t, { name: t, columns: [], primaryKey: [] })
        const dataType = String(r.dt)
        if (BINARY_TYPES.has(dataType)) binaryColumns.add(`${t}.${String(r.c)}`)
        tables.get(t)!.columns.push({
          name: String(r.c),
          dataType,
          columnType: String(r.ct),
          nullable: r.n === "YES",
          maxLength: r.ml === null ? null : Number(r.ml),
        })
      }
      for (const r of pks) tables.get(String(r.t))?.primaryKey.push(String(r.c))
      return { tables: [...tables.values()] }
    },
    beginSnapshot: async () => {
      await query("START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY")
    },
    endSnapshot: async () => {
      await query("COMMIT")
    },
    query,
    stream: async function* (sql: string, params: readonly unknown[] = []) {
      if (lastError) throw lastError
      const s = conn.query({ sql, values: params as unknown[], timeout: statementTimeoutMs }).stream({ highWaterMark: 500 })
      for await (const row of s) yield row as SourceRow
    },
    close: async () => {
      await p.end().catch(() => conn.destroy())
    },
  }
  return port
}
