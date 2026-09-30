/**
 * Kanflow standalone worker — entry point.
 *
 *   npm run worker                      run (translation loop + scheduled surveillance)
 *   npm run worker -- --dry-run         print the resolved config and exit (no DB access)
 *   npm run worker -- --surveillance-now  also start one surveillance run immediately
 *
 * Run from the app directory (.env files are loaded from the working
 * directory). Only this file, ./config and pure helpers are loaded before
 * the dry-run exit; everything that talks to the database is imported
 * dynamically afterwards.
 */
import { parseArgs, USAGE } from "./cli"
import { describeConfig, loadEnvFiles, loadWorkerConfig } from "./config"

function out(text: string): void {
  process.stdout.write(text.endsWith("\n") ? text : `${text}\n`)
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || args.unknown.length > 0) {
    if (args.unknown.length > 0) process.stderr.write(`unknown argument(s): ${args.unknown.join(" ")}\n`)
    out(USAGE)
    process.exit(args.help ? 0 : 2)
  }
  const envFiles = loadEnvFiles(process.cwd(), process.env.NODE_ENV)
  const cfg = loadWorkerConfig(process.env)
  if (args.dryRun) {
    out(JSON.stringify({ dryRun: true, cwd: process.cwd(), envFiles, nodeEnv: process.env.NODE_ENV ?? null, config: describeConfig(cfg) }, null, 2))
    process.exit(0)
  }
  const { runWorker } = await import("./runtime")
  await runWorker(cfg, { surveillanceNow: args.surveillanceNow, envFiles })
}

main().catch((err: unknown) => {
  process.stderr.write(`kanflow-worker failed to start: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`)
  process.exit(1)
})
