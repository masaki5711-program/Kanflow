/**
 * CLI flow of scripts/migrate-mysql-to-pg.ts, with every side effect injected:
 *   parse argv -> deny list -> target guard -> passwords -> run -> report.
 * The guards run BEFORE any connection is opened.
 */
import { describeEndpoint, parseArgs, resolvePasswords, USAGE, type CliArgs, type Passwords } from "./args"
import { assertTargetAllowed, loadDenyList } from "./deny-list"
import { isRefusal, MigratorError } from "./errors"
import { EXIT, type MigrationReport } from "./run"

export interface CliDeps {
  env: Record<string, string | undefined>
  platform: NodeJS.Platform
  readFile: (file: string) => string
  statMode: (file: string) => number
  writeReport: (file: string, report: MigrationReport) => void
  print: (line: string) => void
  /** Opens the connections, runs, closes. */
  run: (args: CliArgs, passwords: Passwords, log: (line: string) => void) => Promise<MigrationReport>
}

export function redact(text: string, secrets: readonly string[]): string {
  return secrets.filter((s) => s.length > 0).reduce((t, s) => t.split(s).join("***"), text)
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
  try {
    const denyText = args.denyFile === null ? null : deps.readFile(args.denyFile)
    assertTargetAllowed(args.target, args.source, loadDenyList(deps.env, denyText))
    passwords = resolvePasswords(args, deps.env, deps.platform, { readFile: deps.readFile, statMode: deps.statMode })
  } catch (e) {
    if (e instanceof MigratorError) {
      deps.print(`refused: ${e.message}`)
      return isRefusal(e.code) ? EXIT.refused : EXIT.usage
    }
    deps.print(`refused: cannot read ${args.denyFile ?? "the deny file"}: ${(e as NodeJS.ErrnoException).code ?? String(e)}`)
    return EXIT.refused
  }

  const secrets = [passwords.source, passwords.target]
  const log = (line: string): void => deps.print(redact(line, secrets))
  log(`mode: ${args.mode}; source ${describeEndpoint(args.source)} -> target ${describeEndpoint(args.target)}; batch ${args.batchSize}`)
  let report: MigrationReport
  try {
    report = await deps.run(args, passwords, log)
  } catch (e) {
    log(`failed: ${e instanceof Error ? e.message : String(e)}`)
    return EXIT.error
  }
  if (args.reportPath !== null) {
    const safe = JSON.parse(redact(JSON.stringify(report), secrets)) as MigrationReport
    deps.writeReport(args.reportPath, safe)
    log(`report: ${args.reportPath}`)
  }
  log(`outcome: ${report.outcome} (exit ${report.exitCode}) in ${report.durationMs ?? 0} ms`)
  return report.exitCode
}
