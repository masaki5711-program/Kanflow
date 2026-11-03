/**
 * CLI flow of scripts/migrate-mysql-to-pg.ts, with every side effect injected:
 *   parse argv -> --expect-target -> deny list -> target guard -> passwords (mode / ACL)
 *   -> run -> report.
 * The guards run BEFORE any connection is opened. Output and reports carry no
 * secrets (redacted on the object) and no row values (sanitized errors).
 */
import { describeEndpoint, parseArgs, resolvePasswords, USAGE, type CliArgs, type Passwords } from "./args"
import { assertExpectedTarget, assertTargetAllowed, identityDenyList, loadDenyList } from "./deny-list"
import { isRefusal, MigratorError } from "./errors"
import { EXIT, type InvalidJsonRecord, type MigrationReport, type RunHooks, type RunOptions, type WarningBaseline } from "./run"
import { redactDeep, sanitizeError } from "./sanitize"

export interface CliDeps {
  env: Record<string, string | undefined>
  platform: NodeJS.Platform
  readFile: (file: string) => string
  statMode: (file: string) => number
  /** Windows: throws when the file's ACL grants a broad group (file-acl.ts). */
  aclCheck?: (file: string) => void
  /** Atomic (temp + rename) write of a JSON report. */
  writeReport: (file: string, report: MigrationReport) => void
  /** Atomic write of a protected (owner-only) side file. */
  writeSideFile?: (file: string, content: string) => void
  print: (line: string) => void
  /** Opens the connections, runs, closes. */
  run: (args: CliArgs, passwords: Passwords, log: (line: string) => void, hooks?: Omit<RunHooks, "log">, extra?: Partial<RunOptions>) => Promise<MigrationReport>
}

export function redact(text: string, secrets: readonly string[]): string {
  return secrets.filter((s) => s.length > 0).reduce((t, s) => t.split(s).join("***"), text)
}

function errorReport(args: CliArgs, error: string): MigrationReport {
  const now = new Date().toISOString()
  return {
    mode: args.mode as MigrationReport["mode"],
    startedAt: now,
    finishedAt: now,
    durationMs: 0,
    source: describeEndpoint(args.source),
    target: describeEndpoint(args.target),
    precheck: { errors: [], warnings: [], info: [] },
    acceptedWarnings: [],
    unacceptedWarnings: [],
    timestampAnalysis: [],
    sourceCounts: {},
    committed: false,
    timings: {},
    outcome: "error",
    exitCode: EXIT.error,
    error,
  }
}

/** The reviewed dry run's warnings, from its JSON report. */
export function baselineFromReport(text: string): WarningBaseline {
  const r = JSON.parse(text) as Partial<MigrationReport>
  const identity = r.sourceServer?.identity
  if (r.mode !== "dry-run" || typeof identity !== "string" || !Array.isArray(r.precheck?.warnings)) {
    throw new MigratorError("USAGE", "--dry-run-report is not the JSON report of a dry run")
  }
  return { sourceIdentity: identity, warnings: r.precheck.warnings.map((w) => ({ code: w.code, table: w.table, column: w.column, count: w.count })) }
}

export async function cliMain(argv: readonly string[], deps: CliDeps): Promise<number> {
  let args: CliArgs
  try {
    args = parseArgs(argv)
  } catch (e) {
    if (e instanceof MigratorError) {
      deps.print(`error: ${e.message}`)
      if (e.code === "USAGE") deps.print(USAGE)
      return e.code === "USAGE" ? EXIT.usage : EXIT.refused
    }
    throw e
  }
  if (args.mode === "help") {
    deps.print(USAGE)
    return EXIT.ok
  }

  let passwords: Passwords
  const extra: Partial<RunOptions> = {}
  try {
    assertExpectedTarget(args.target, args.expectTarget)
    const denyText = args.denyFile === null ? null : deps.readFile(args.denyFile)
    const deny = loadDenyList(deps.env, denyText)
    assertTargetAllowed(args.target, args.source, deny)
    extra.denyTargetIdentities = identityDenyList(deny)
    if (args.dryRunReport !== null) {
      try {
        extra.warningBaseline = baselineFromReport(deps.readFile(args.dryRunReport))
      } catch (e) {
        throw e instanceof MigratorError ? new MigratorError("SIDE_FILE", e.message) : new MigratorError("SIDE_FILE", `--dry-run-report unreadable: ${sanitizeError(e)}`)
      }
    }
    passwords = resolvePasswords(args, deps.env, deps.platform, { readFile: deps.readFile, statMode: deps.statMode })
    if (deps.platform === "win32" && deps.aclCheck) {
      for (const f of [args.sourcePasswordFile, args.targetPasswordFile]) if (f !== null) deps.aclCheck(f)
    }
  } catch (e) {
    if (e instanceof MigratorError) {
      deps.print(`refused: ${e.message}`)
      return isRefusal(e.code) ? EXIT.refused : EXIT.usage
    }
    deps.print(`refused: cannot read a configured file: ${(e as NodeJS.ErrnoException).code ?? sanitizeError(e)}`)
    return EXIT.refused
  }

  const secrets = [passwords.source, passwords.target]
  const log = (line: string): void => deps.print(redact(line, secrets))
  log(`mode: ${args.mode}; source ${describeEndpoint(args.source)} -> target ${describeEndpoint(args.target)}; batch ${args.batchSize}`)
  const hooks: Omit<RunHooks, "log"> = {}
  if (args.invalidJsonFile !== null) {
    const file = args.invalidJsonFile
    hooks.onInvalidJsonNulled = (records: InvalidJsonRecord[]) => {
      if (!deps.writeSideFile) throw new MigratorError("SIDE_FILE", "no side-file writer configured")
      deps.writeSideFile(file, records.map((r) => JSON.stringify(r)).join("\n") + "\n")
      log(`[precheck] ${records.length} invalid JSON value(s) (keys + originals) written to ${file}`)
    }
  }
  let report: MigrationReport
  try {
    report = await deps.run(args, passwords, log, hooks, extra)
  } catch (e) {
    // Connection / setup failure: still leave a report behind.
    report = errorReport(args, sanitizeError(e))
    log(`failed: ${report.error}`)
  }
  report = redactDeep(report, secrets)
  if (args.reportPath !== null) {
    try {
      deps.writeReport(args.reportPath, report)
      log(`report: ${args.reportPath}`)
    } catch (e) {
      log(`ERROR: the report could not be written to ${args.reportPath} (${sanitizeError(e)}); the run itself ended with exit ${report.exitCode} (${report.outcome}, committed=${String(report.committed)})`)
    }
  }
  log(`outcome: ${report.outcome} (exit ${report.exitCode}, committed=${String(report.committed)}) in ${report.durationMs ?? 0} ms`)
  return report.exitCode
}
