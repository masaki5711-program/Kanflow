/**
 * The two database connections as the migrator sees them. Real implementations:
 * mysql-port.ts (mysql2) and pg-port.ts (pg). Unit tests use in-memory fakes.
 *
 * Every statement starts with a `/* k2:<purpose>:<table> *\/` tag (sql.ts) so
 * logs, pg_stat_activity and the test fakes can tell what it is.
 */
import type { SourceValue } from "./convert"
import type { SourceSchema, TargetSchema } from "./schema"

export type SourceRow = Record<string, SourceValue>
/** PostgreSQL rows: every value in PostgreSQL's text output form (no driver parsing). */
export type TargetRow = Record<string, string | null>

export interface SourceServerInfo {
  version: string
  /** default character set / collation of the source database */
  charset: string
  collation: string
  /** @@lower_case_table_names (1 = the Windows default: table names stored in lower case) */
  lowerCaseTableNames?: number
  /** @@server_uuid: recorded by the dry run, required to match by the migrate run */
  identity: string
}

export interface TargetServerInfo {
  version: string
  encoding: string
  localeProvider: string
  icuLocale: string | null
  /** <pg_control_system().system_identifier>/<database oid>: recorded by the dry run */
  identity: string
}

export interface SourcePort {
  describe(): string
  serverInfo(): Promise<SourceServerInfo>
  introspect(): Promise<SourceSchema>
  /** START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY - every later read sees one point in time. */
  beginSnapshot(): Promise<void>
  endSnapshot(): Promise<void>
  query(sql: string, params?: readonly unknown[]): Promise<SourceRow[]>
  /** Streams a large result with back-pressure (bounded memory). */
  stream(sql: string, params?: readonly unknown[]): AsyncIterable<SourceRow>
  close(): Promise<void>
}

export interface TargetPort {
  describe(): string
  serverInfo(): Promise<TargetServerInfo>
  introspect(): Promise<TargetSchema>
  /** Every statement is bounded (keyset chunks); there is no long-running target stream. */
  query(sql: string, params?: readonly unknown[]): Promise<TargetRow[]>
  /** readOnly: REPEATABLE READ READ ONLY (one snapshot for verification); otherwise READ COMMITTED read-write. */
  begin(readOnly: boolean): Promise<void>
  commit(): Promise<void>
  rollback(): Promise<void>
  close(): Promise<void>
}
