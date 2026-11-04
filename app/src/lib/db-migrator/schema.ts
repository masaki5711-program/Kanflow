/** Introspected shapes of the two databases (filled by the ports). */

export interface TargetColumn {
  name: string
  /** pg_type.typname, e.g. "text", "citext", "bool", "timestamp" */
  typname: string
  /** pg_type.typtype ("b" base, "e" enum, "d" domain, ...) */
  typtype: string
  /** format_type(), used verbatim as the cast in INSERTs, e.g. "timestamp(3) without time zone" */
  pgType: string
  nullable: boolean
  /** The column has a default (DEFAULT, identity or generated): an INSERT without it gets a value. */
  hasDefault: boolean
  /** character length bound (varchar(n) / char(n)); null = unbounded */
  maxLength: number | null
  isCitext: boolean
}

export interface TargetTable {
  name: string
  columns: TargetColumn[]
  primaryKey: string[]
}

export interface TargetForeignKey {
  name: string
  table: string
  columns: string[]
  refTable: string
  refColumns: string[]
}

export interface TargetUniqueKey {
  name: string
  table: string
  columns: string[]
}

export interface TargetSequence {
  table: string
  column: string
  sequence: string
}

export interface TargetMigration {
  name: string
  finished: boolean
  rolledBack: boolean
}

export interface TargetSchema {
  tables: TargetTable[]
  foreignKeys: TargetForeignKey[]
  uniqueKeys: TargetUniqueKey[]
  sequences: TargetSequence[]
  /** rows of _prisma_migrations; empty when the table is missing */
  migrations: TargetMigration[]
}

export interface SourceColumn {
  name: string
  /** information_schema.COLUMNS.DATA_TYPE, lower case */
  dataType: string
  /** information_schema.COLUMNS.COLUMN_TYPE, lower case, e.g. "tinyint(1)" */
  columnType: string
  nullable: boolean
  maxLength: number | null
}

export interface SourceTable {
  name: string
  columns: SourceColumn[]
  primaryKey: string[]
}

export interface SourceSchema {
  tables: SourceTable[]
}

/** Never copied: Prisma's own bookkeeping. The target gets its rows from `prisma migrate deploy`. */
export const EXCLUDED_TABLES = new Set(["_prisma_migrations"])
