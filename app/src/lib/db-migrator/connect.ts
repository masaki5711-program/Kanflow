/** Opens the real connections for one CLI run and always closes them. */
import fs from "node:fs"
import type { CliArgs, Passwords } from "./args"
import { openMysqlSource } from "./mysql-port"
import { openPgTarget } from "./pg-port"
import type { SourcePort, TargetPort } from "./ports"
import { runMigrator, type MigrationReport, type RunHooks, type RunOptions } from "./run"
import { sanitizeError } from "./sanitize"

export async function runWithConnections(
  args: CliArgs,
  passwords: Passwords,
  log: (line: string) => void,
  hooks: Omit<RunHooks, "log"> = {},
  extra: Partial<RunOptions> = {},
): Promise<MigrationReport> {
  if (args.mode === "help") throw new Error("help mode has nothing to run")
  const timeoutMs = args.statementTimeoutSec * 1000
  const ca = (f: string | null): string | null => (f === null ? null : fs.readFileSync(f, "utf8"))
  let source: SourcePort | null = null
  let target: TargetPort | null = null
  try {
    source = await openMysqlSource(args.source, passwords.source, timeoutMs, ca(args.sourceCaFile))
    target = await openPgTarget(args.target, passwords.target, { readOnly: args.mode !== "migrate", statementTimeoutMs: timeoutMs, caPem: ca(args.targetCaFile) })
    return await runMigrator(
      {
        mode: args.mode,
        batchSize: args.batchSize,
        allowInvalidJson: args.allowInvalidJson,
        acceptWarnings: args.acceptWarnings,
        expectSourceIdentity: args.sourceIdentity,
        expectTargetIdentity: args.targetIdentity,
        localOffsetHours: args.localOffsetHours,
        ...extra,
      },
      { source, target },
      { ...hooks, log },
    )
  } finally {
    for (const [name, port] of [["source", source], ["target", target]] as const) {
      if (port) await port.close().catch((e: unknown) => log(`[close] ${name}: ${sanitizeError(e)}`))
    }
  }
}
