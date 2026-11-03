/**
 * Failures of the MySQL -> PostgreSQL migrator (MR K2). Every refusal carries a
 * stable code so the rehearsal / cutover record can name it; the CLI maps the
 * code family to an exit status (see EXIT in run.ts).
 */
export type MigratorErrorCode =
  | "USAGE"
  | "PASSWORD_ON_ARGV"
  | "PASSWORD_MISSING"
  | "PASSWORD_FILE_MODE"
  | "PASSWORD_FILE_UNREADABLE"
  | "DENY_LIST_MISSING"
  | "DENY_LIST_INVALID"
  | "TARGET_DENIED"
  | "FK_CYCLE_UNBREAKABLE"
  | "FK_UNKNOWN_TABLE"
  | "CONVERSION"
  | "TLS_REQUIRED"
  | "EXPECT_TARGET_MISMATCH"
  | "IDENTITY_MISMATCH"
  | "SIDE_FILE"

export class MigratorError extends Error {
  readonly code: MigratorErrorCode

  constructor(code: MigratorErrorCode, message: string) {
    super(`${code}: ${message}`)
    this.name = "MigratorError"
    this.code = code
  }
}

/** Codes that are a refusal by a safety guard (exit 2), not a usage error. */
export function isRefusal(code: MigratorErrorCode): boolean {
  return code !== "USAGE"
}
