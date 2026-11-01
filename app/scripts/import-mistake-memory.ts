/**
 * Import of the agent model's mistake-memory records as confirmed, global lessons (W11, feedback loop).
 *
 *   node --import tsx scripts/import-mistake-memory.ts --file <path/to/.claude/mistakes/records.jsonl>            dry run (default)
 *   node --import tsx scripts/import-mistake-memory.ts --file <path> --apply                                     write the lessons
 *
 * Run from the app directory (.env files are read from the working directory, like the worker).
 * Requires the 20261101160000_feedback_loop migration.
 *
 * Each record becomes a `confirmed` lesson (scope global, evidence = the record id and the file name). The key is
 * the failure signature of the record's `signature` text (services/feedback/signature, tool "mistake-memory"), so the
 * script is idempotent: records already imported — or curated since — are left alone, and the same file can be
 * imported again after it gained records. Records without a fix, with a duplicate signature or with something
 * credential-like left after redaction are skipped and listed. Text is redacted exactly like a failure report.
 */
import fs from "node:fs"
import path from "node:path"
import { loadEnvFiles } from "../src/worker/config"
import { applyMistakeImport, planMistakeImport } from "../src/services/feedback/feedback.import"

const USAGE = "usage: node --import tsx scripts/import-mistake-memory.ts --file <records.jsonl> [--dry-run | --apply]"

function out(line: string): void {
  process.stdout.write(`${line}\n`)
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  let apply = false
  let file: string | null = null
  const unknown: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--apply") apply = true
    else if (a === "--dry-run") apply = false
    else if (a === "--file" && argv[i + 1]) file = argv[++i]
    else if (a === "--help" || a === "-h") {
      out(USAGE)
      return 0
    } else unknown.push(a)
  }
  if (unknown.length > 0 || !file) {
    process.stderr.write(`${unknown.length > 0 ? `unknown argument(s): ${unknown.join(" ")}\n` : "--file is required\n"}${USAGE}\n`)
    return 2
  }

  // Env first: FEEDBACK_ALLOWED_HOSTS (redaction allow-list) and DATABASE_* come from the .env files.
  const envFiles = loadEnvFiles(process.cwd(), process.env.NODE_ENV)
  const text = fs.readFileSync(file, "utf8")
  const now = new Date()
  const plan = planMistakeImport(text, path.basename(path.dirname(path.dirname(path.resolve(file)))) + "/" + path.basename(file), now)
  const byReason = new Map<string, number>()
  for (const s of plan.skipped) byReason.set(s.reason, (byReason.get(s.reason) ?? 0) + 1)
  out(`records planned: ${plan.lessons.length}, skipped: ${plan.skipped.length}${[...byReason].map(([r, n]) => ` ${r}=${n}`).join("")}`)
  for (const s of plan.skipped.slice(0, 50)) out(`skipped line ${s.line}${s.id ? ` (${s.id})` : ""}: ${s.reason}`)
  if (plan.skipped.length > 50) out(`... and ${plan.skipped.length - 50} more skipped`)

  if (!apply) {
    out("dry run: nothing written. Re-run with --apply to import.")
    return 0
  }
  out(`APPLY; env: ${envFiles.join(", ") || "(none)"}`)
  // Imported after the env files are loaded: the client reads DATABASE_* on creation.
  const { prisma } = await import("../src/lib/prisma")
  try {
    const result = await applyMistakeImport(prisma, plan, now)
    out(`created: ${result.created}, already present: ${result.existing}`)
    return 0
  } finally {
    await prisma.$disconnect()
  }
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    process.stderr.write(`import-mistake-memory failed: ${err instanceof Error ? err.message : String(err)}\n`)
    process.exit(1)
  },
)
