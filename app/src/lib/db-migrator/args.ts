/**
 * Command line of scripts/migrate-mysql-to-pg.ts.
 *
 * Safety rules (docs/operations/mysql-to-pg-cutover.md):
 * - the source and the target come ONLY from --source / --target. Nothing is
 *   read from DATABASE_URL / DATABASE_* - a forgotten .env must never pick the
 *   database the tool writes to;
 * - a URL must not carry a password (argv is visible in the process list and
 *   in shell history). Passwords come from KANFLOW_MIGRATOR_SOURCE_PASSWORD /
 *   KANFLOW_MIGRATOR_TARGET_PASSWORD or from --source-password-file /
 *   --target-password-file (a file readable by its owner only);
 * - there is deliberately no option to skip the empty-target check.
 */
import fs from "node:fs"
import { MigratorError } from "./errors"

export type Mode = "migrate" | "dry-run" | "verify-only" | "help"

export interface Endpoint {
  scheme: "mysql" | "postgresql"
  user: string
  host: string
  port: number
  database: string
}

export interface CliArgs {
  mode: Mode
  source: Endpoint
  target: Endpoint
  batchSize: number
  allowInvalidJson: boolean
  reportPath: string | null
  denyFile: string | null
  sourcePasswordFile: string | null
  targetPasswordFile: string | null
  statementTimeoutSec: number
}

export const USAGE = `usage: node --import tsx scripts/migrate-mysql-to-pg.ts \\
    --source mysql://<user>@<host>:<port>/<db> --target postgresql://<user>@<host>:<port>/<db> \\
    [--dry-run | --verify-only] [--batch-size 1-10000 (1000)] [--allow-invalid-json] \\
    [--report <file.json>] [--deny-file <file>] [--statement-timeout-sec <n> (900)] \\
    [--source-password-file <file>] [--target-password-file <file>]

  passwords: KANFLOW_MIGRATOR_SOURCE_PASSWORD / KANFLOW_MIGRATOR_TARGET_PASSWORD or the *-password-file options
  deny list: KANFLOW_MIGRATOR_DENY_TARGETS="host:port/db,..." and/or --deny-file (at least one entry is required)
  exit: 0 ok, 1 verification mismatch, 2 refused (guard / pre-check), 3 failed and rolled back, 64 usage`

const DEFAULT_PORT = { mysql: 3306, postgresql: 5432 } as const

function usage(message: string): MigratorError {
  return new MigratorError("USAGE", message)
}

export function parseEndpoint(raw: string, expected: Endpoint["scheme"], flag: string): Endpoint {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw usage(`${flag}: not a URL`)
  }
  const scheme = url.protocol.replace(/:$/, "")
  const normalized = scheme === "postgres" ? "postgresql" : scheme
  if (normalized !== expected) throw usage(`${flag}: expected a ${expected}:// URL, got ${scheme}://`)
  if (url.password !== "") {
    throw new MigratorError("PASSWORD_ON_ARGV", `${flag}: remove the password from the URL; use the environment variable or a password file`)
  }
  if (url.username === "") throw usage(`${flag}: the URL must name the user (${expected}://<user>@host:port/db)`)
  if (url.search !== "" || url.hash !== "") throw usage(`${flag}: query strings / fragments are not supported`)
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""))
  if (database === "" || database.includes("/")) throw usage(`${flag}: the URL must name exactly one database`)
  const host = url.hostname.replace(/^\[(.*)\]$/, "$1")
  if (host === "") throw usage(`${flag}: the URL must name the host`)
  const port = url.port === "" ? DEFAULT_PORT[expected] : Number(url.port)
  return { scheme: expected, user: decodeURIComponent(url.username), host, port, database }
}

/** Endpoint for logs and reports: never contains a password (it is never stored in an Endpoint). */
export function describeEndpoint(e: Endpoint): string {
  const host = e.host.includes(":") ? `[${e.host}]` : e.host
  return `${e.scheme}://${e.user}@${host}:${e.port}/${e.database}`
}

function intOption(flag: string, raw: string | undefined, min: number, max: number): number {
  if (raw === undefined || !/^\d+$/.test(raw)) throw usage(`${flag} needs an integer`)
  const n = Number(raw)
  if (n < min || n > max) throw usage(`${flag} must be between ${min} and ${max}`)
  return n
}

export function parseArgs(argv: readonly string[]): CliArgs {
  let source: string | null = null
  let target: string | null = null
  let dryRun = false
  let verifyOnly = false
  const out: Omit<CliArgs, "mode" | "source" | "target"> = {
    batchSize: 1000,
    allowInvalidJson: false,
    reportPath: null,
    denyFile: null,
    sourcePasswordFile: null,
    targetPasswordFile: null,
    statementTimeoutSec: 900,
  }
  const value = (i: number, flag: string): string => {
    const v = argv[i + 1]
    if (v === undefined || v.startsWith("--")) throw usage(`${flag} needs a value`)
    return v
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    switch (a) {
      case "--help":
      case "-h":
        return { mode: "help" } as CliArgs
      case "--source":
        source = value(i++, a)
        break
      case "--target":
        target = value(i++, a)
        break
      case "--dry-run":
        dryRun = true
        break
      case "--verify-only":
        verifyOnly = true
        break
      case "--allow-invalid-json":
        out.allowInvalidJson = true
        break
      case "--batch-size":
        out.batchSize = intOption(a, argv[++i], 1, 10000)
        break
      case "--statement-timeout-sec":
        out.statementTimeoutSec = intOption(a, argv[++i], 1, 86400)
        break
      case "--report":
        out.reportPath = value(i++, a)
        break
      case "--deny-file":
        out.denyFile = value(i++, a)
        break
      case "--source-password-file":
        out.sourcePasswordFile = value(i++, a)
        break
      case "--target-password-file":
        out.targetPasswordFile = value(i++, a)
        break
      default:
        throw usage(`unknown argument: ${a}`)
    }
  }
  if (source === null || target === null) throw usage("--source and --target are both required (never taken from the environment)")
  if (dryRun && verifyOnly) throw usage("--dry-run and --verify-only are exclusive")
  return {
    ...out,
    mode: dryRun ? "dry-run" : verifyOnly ? "verify-only" : "migrate",
    source: parseEndpoint(source, "mysql", "--source"),
    target: parseEndpoint(target, "postgresql", "--target"),
  }
}

/** POSIX: the password file must not be readable or writable by group / others. */
export function assertPrivateFileMode(file: string, mode: number, platform: NodeJS.Platform): void {
  if (platform === "win32") return // NTFS ACLs: see the cutover runbook (icacls)
  if ((mode & 0o077) !== 0) {
    throw new MigratorError("PASSWORD_FILE_MODE", `${file} is accessible by group/others (mode ${(mode & 0o777).toString(8)}); chmod 600 it`)
  }
}

export interface Passwords {
  source: string
  target: string
}

export interface FileAccess {
  readFile: (file: string) => string
  statMode: (file: string) => number
}

const defaultFileAccess = (): FileAccess => ({
  readFile: (f) => fs.readFileSync(f, "utf8"),
  statMode: (f) => fs.statSync(f).mode,
})

function readPasswordFile(file: string, platform: NodeJS.Platform, io: FileAccess): string {
  let mode: number
  let text: string
  try {
    mode = io.statMode(file)
    text = io.readFile(file)
  } catch (e) {
    throw new MigratorError("PASSWORD_FILE_UNREADABLE", `${file}: ${(e as NodeJS.ErrnoException).code ?? "unreadable"}`)
  }
  assertPrivateFileMode(file, mode, platform)
  const pw = (text.split(/\r?\n/)[0] ?? "").trim()
  if (pw === "") throw new MigratorError("PASSWORD_MISSING", `${file} is empty`)
  return pw
}

export function resolvePasswords(
  args: Pick<CliArgs, "sourcePasswordFile" | "targetPasswordFile">,
  env: Record<string, string | undefined>,
  platform: NodeJS.Platform,
  io: FileAccess = defaultFileAccess(),
): Passwords {
  const pick = (file: string | null, envName: string, side: string): string => {
    if (file !== null) return readPasswordFile(file, platform, io)
    const v = env[envName]
    if (v === undefined || v === "") {
      throw new MigratorError("PASSWORD_MISSING", `no ${side} password: set ${envName} or pass --${side}-password-file`)
    }
    return v
  }
  return {
    source: pick(args.sourcePasswordFile, "KANFLOW_MIGRATOR_SOURCE_PASSWORD", "source"),
    target: pick(args.targetPasswordFile, "KANFLOW_MIGRATOR_TARGET_PASSWORD", "target"),
  }
}
