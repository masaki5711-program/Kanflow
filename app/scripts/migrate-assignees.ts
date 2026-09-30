/**
 * One-off backfill: SprintBacklogItem.assignee (comma-separated names)
 *   → TaskAssignee(taskId, userId) rows.   (roadmap P2, migration 20261002000000)
 *
 *   node --import tsx scripts/migrate-assignees.ts                dry run (default): plan + CSV report, no writes
 *   node --import tsx scripts/migrate-assignees.ts --apply        insert the planned rows
 *   node --import tsx scripts/migrate-assignees.ts --project <id> limit to one project
 *   node --import tsx scripts/migrate-assignees.ts --report <file.csv>
 *
 * Run from the app directory (.env files are read from the working
 * directory, like the worker). Requires the 20261002000000_p2_collab_foundation
 * migration to be applied first.
 *
 * Idempotent: rows already in TaskAssignee are skipped when planning, and the
 * insert uses skipDuplicates (INSERT IGNORE) as a second guard. The legacy
 * `assignee` column is never modified.
 *
 * Matching (src/lib/assignees.ts): each name is matched against the task's
 * project members — exact, then case-insensitive, then ignoring spaces.
 * Ambiguous names, unknown names and names that only match a non-member are
 * NOT inserted; they are listed in the CSV report for manual follow-up.
 */
import fs from "node:fs"
import path from "node:path"
import { loadEnvFiles } from "../src/worker/config"
import { backfillReportCsv, planAssigneeBackfill, type BackfillTask } from "../src/lib/assignee-backfill"

const INSERT_CHUNK = 500

interface Args {
  apply: boolean
  projectId: string | null
  reportPath: string | null
  help: boolean
  unknown: string[]
}

const USAGE = `usage: node --import tsx scripts/migrate-assignees.ts [--dry-run | --apply] [--project <id>] [--report <file.csv>]`

function parseArgs(argv: readonly string[]): Args {
  const args: Args = { apply: false, projectId: null, reportPath: null, help: false, unknown: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--apply") args.apply = true
    else if (a === "--dry-run") args.apply = false
    else if (a === "--help" || a === "-h") args.help = true
    else if (a === "--project" && argv[i + 1]) args.projectId = argv[++i]
    else if (a === "--report" && argv[i + 1]) args.reportPath = argv[++i]
    else args.unknown.push(a)
  }
  return args
}

function out(line: string): void {
  process.stdout.write(`${line}\n`)
}

function timestamp(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-")
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || args.unknown.length > 0) {
    if (args.unknown.length > 0) process.stderr.write(`unknown argument(s): ${args.unknown.join(" ")}\n`)
    out(USAGE)
    return args.help ? 0 : 2
  }

  const envFiles = loadEnvFiles(process.cwd(), process.env.NODE_ENV)
  out(`mode: ${args.apply ? "APPLY (writes TaskAssignee rows)" : "dry run (no writes)"}; env: ${envFiles.join(", ") || "(none)"}`)

  // Imported after the env files are loaded: the client reads DATABASE_* on creation.
  const { prisma } = await import("../src/lib/prisma")
  try {
    const [users, memberships, rows] = await Promise.all([
      prisma.user.findMany({ select: { id: true, name: true } }),
      prisma.projectMember.findMany({ select: { projectId: true, userId: true } }),
      prisma.sprintBacklogItem.findMany({
        where: {
          assignee: { not: null },
          ...(args.projectId ? { sprint: { projectId: args.projectId } } : {}),
        },
        select: {
          id: true,
          assignee: true,
          sprint: { select: { projectId: true } },
          assignees: { select: { userId: true } },
        },
      }),
    ])

    const tasks: BackfillTask[] = rows.map((r) => ({
      id: r.id,
      projectId: r.sprint.projectId,
      assignee: r.assignee,
      existingUserIds: r.assignees.map((a) => a.userId),
    }))
    const plan = planAssigneeBackfill(tasks, users, memberships)

    const reportPath = path.resolve(args.reportPath ?? path.join("logs", `migrate-assignees-${timestamp()}.csv`))
    fs.mkdirSync(path.dirname(reportPath), { recursive: true })
    fs.writeFileSync(reportPath, backfillReportCsv(plan.report), "utf8")

    out(JSON.stringify(plan.stats, null, 2))
    out(`unresolved names report: ${reportPath} (${plan.report.length} row(s))`)

    if (!args.apply) {
      out(`dry run: ${plan.inserts.length} TaskAssignee row(s) would be inserted. Re-run with --apply to write.`)
      return 0
    }

    let inserted = 0
    for (let i = 0; i < plan.inserts.length; i += INSERT_CHUNK) {
      const chunk = plan.inserts.slice(i, i + INSERT_CHUNK)
      const result = await prisma.taskAssignee.createMany({ data: chunk, skipDuplicates: true })
      inserted += result.count
    }
    out(`applied: inserted ${inserted} of ${plan.inserts.length} planned TaskAssignee row(s).`)
    return 0
  } finally {
    await prisma.$disconnect()
  }
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    process.stderr.write(`migrate-assignees failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`)
    process.exit(1)
  },
)
