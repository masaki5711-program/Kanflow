/**
 * One-off backfill: recompute the STORED derived master-plan values
 * (PlanItem.progressPct / status and the parents' plannedStart / plannedEnd)
 * of every project, with the same rules GET /plan uses
 * (src/services/plan/plan.heal.ts).   (migration 20261004000000_plan_linkage)
 *
 *   node --import tsx scripts/heal-plan.ts                dry run (default): per project, the rows that would change
 *   node --import tsx scripts/heal-plan.ts --apply        write the changes
 *   node --import tsx scripts/heal-plan.ts --project <id> limit to one project
 *
 * Run from the app directory (.env files are read from the working
 * directory, like the worker), AFTER the 20261004000000_plan_linkage
 * migration. Without it, parent roll-ups are only healed when someone opens
 * the project's plan (and by the daily notify-due job for active projects).
 *
 * Covers every project not in the trash (archived ones too) that has live
 * plan items. Idempotent: a second run finds nothing to change. Writes do not
 * bump PlanItem.version (derived columns are not user edits). A project whose
 * plan reached LIST_LIMITS.planItems is skipped and reported. A project whose
 * write fails is reported and the run continues (exit code 1 at the end).
 */
import { loadEnvFiles } from "../src/worker/config"

interface Args {
  apply: boolean
  projectId: string | null
  help: boolean
  unknown: string[]
}

const USAGE = `usage: node --import tsx scripts/heal-plan.ts [--dry-run | --apply] [--project <id>]`

function parseArgs(argv: readonly string[]): Args {
  const args: Args = { apply: false, projectId: null, help: false, unknown: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--apply") args.apply = true
    else if (a === "--dry-run") args.apply = false
    else if (a === "--help" || a === "-h") args.help = true
    else if (a === "--project" && argv[i + 1]) args.projectId = argv[++i]
    else args.unknown.push(a)
  }
  return args
}

function out(line: string): void {
  process.stdout.write(`${line}\n`)
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || args.unknown.length > 0) {
    if (args.unknown.length > 0) process.stderr.write(`unknown argument(s): ${args.unknown.join(" ")}\n`)
    out(USAGE)
    return args.help ? 0 : 2
  }

  const envFiles = loadEnvFiles(process.cwd(), process.env.NODE_ENV)
  out(`mode: ${args.apply ? "APPLY (writes PlanItem derived values)" : "dry run (no writes)"}; env: ${envFiles.join(", ") || "(none)"}`)

  // Imported after the env files are loaded: the client reads DATABASE_* on creation.
  const { prisma } = await import("../src/lib/prisma")
  const { describePlanHealUpdate, healProjectPlan } = await import("../src/services/plan/plan.heal")
  try {
    const projects = await prisma.project.findMany({
      where: { deletedAt: null, planItems: { some: { deletedAt: null } }, ...(args.projectId ? { id: args.projectId } : {}) },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    })
    const totals = { projects: projects.length, changedProjects: 0, rows: 0, capped: 0, failed: 0 }

    for (const p of projects) {
      try {
        const r = await healProjectPlan(p.id, { apply: args.apply })
        if (r.capped) {
          totals.capped += 1
          out(`[skipped] ${p.name} (${p.id}): plan reached the list limit; heal it by editing the plan`)
          continue
        }
        if (r.updates.length === 0) continue
        totals.changedProjects += 1
        totals.rows += r.updates.length
        out(`${p.name} (${p.id}): ${r.updates.length} row(s) ${args.apply ? "updated" : "would change"}`)
        const byId = new Map(r.rows.map((row) => [row.id, row]))
        for (const u of r.updates) {
          const row = byId.get(u.id)
          if (row) out(`  - ${describePlanHealUpdate(row, u)}`)
        }
      } catch (err) {
        totals.failed += 1
        out(`[failed] ${p.name} (${p.id}): ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    out(JSON.stringify(totals, null, 2))
    if (!args.apply && totals.rows > 0) out(`dry run: ${totals.rows} row(s) in ${totals.changedProjects} project(s) would change. Re-run with --apply to write.`)
    return totals.failed > 0 ? 1 : 0
  } finally {
    await prisma.$disconnect()
  }
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    process.stderr.write(`heal-plan failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`)
    process.exit(1)
  },
)
