/** Command-line parsing for src/worker/main.ts (pure). */

export interface CliArgs {
  dryRun: boolean
  surveillanceNow: boolean
  help: boolean
  unknown: string[]
}

export const USAGE = `Usage: npm run worker -- [--dry-run] [--surveillance-now]
  --dry-run           print the resolved configuration and exit (never touches the database)
  --surveillance-now  start one AI surveillance run right after start-up
`

export function parseArgs(argv: ReadonlyArray<string>): CliArgs {
  const args: CliArgs = { dryRun: false, surveillanceNow: false, help: false, unknown: [] }
  for (const a of argv) {
    if (a === "--dry-run") args.dryRun = true
    else if (a === "--surveillance-now") args.surveillanceNow = true
    else if (a === "--help" || a === "-h") args.help = true
    else args.unknown.push(a)
  }
  return args
}
