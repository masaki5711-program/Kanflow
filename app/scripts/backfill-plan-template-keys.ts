/**
 * One-off backfill (plan 12 E0): PlanItem.templateKey for plan rows created by a plan-template load
 * (PlanTemplateApplication, whose content snapshot is stored) before Kanflow wrote the key.
 * (migration 20261102180000_plan_schedule_load)
 *
 *   node --import tsx scripts/backfill-plan-template-keys.ts                dry run (default): counts per load
 *   node --import tsx scripts/backfill-plan-template-keys.ts --apply        write the keys
 *   node --import tsx scripts/backfill-plan-template-keys.ts --project <id> limit to one project
 *
 * Run from the app directory (.env files are read from the working directory, like the worker), AFTER the
 * migration. Never runs automatically.
 *
 * Matching (src/lib/plan-schedule/template-key-backfill.ts): by tree position + name, only when unambiguous;
 * the key is the stage's own key or its positional key `_pos-<path>`. Low confidence (duplicate sibling names,
 * renamed rows, rows under an unmatched parent) leaves the key null. Rows of every state are considered,
 * trashed ones included (they are still history).
 *
 * Idempotent: a row that already has a key is never changed, and the write itself is guarded with
 * `templateKey IS NULL`, so a second run (or a run racing a new load) writes nothing twice. Writes do not bump
 * PlanItem.version (not a user edit). One transaction per load; a load whose content cannot be read or whose
 * write fails is reported and the run continues (exit code 1 at the end).
 *
 * Positional keys (`_pos-<path>`) are positions in THAT load's template snapshot: compare them only between rows
 * of the same templateApplicationId (or loads of the same template version). An edited template can put another
 * stage at the same position; stages with their own `key` are comparable across versions.
 *
 * Lineage of these rows: their templateApplicationId → template id and version, i.e. the same family the
 * load record would name `template:<templateId>` (sourceRef `template:<templateId>@v<templateVersion>`).
 * No plan_schedule_load record is created for old template loads.
 */
import { loadEnvFiles } from "../src/worker/config"

interface Args {
  apply: boolean
  projectId: string | null
  help: boolean
  unknown: string[]
}

const USAGE = `usage: node --import tsx scripts/backfill-plan-template-keys.ts [--dry-run | --apply] [--project <id>]`

function parseArgs(argv: readonly string[]): Args {
  const args: Args = { apply: false, projectId: null, help: false, unknown: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--apply") args.apply = true
    else if (a === "--dry-run") args.apply = false
    else if (a === "--help" || a === "-h") args.help = true
    // A missing value or another flag in its place ("--project --apply") is refused, never taken as the id.
    else if (a === "--project" && argv[i + 1] && !argv[i + 1].startsWith("--")) args.projectId = argv[++i]
    else args.unknown.push(a)
  }
  return args
}

function out(line: string): void {
  process.stdout.write(`${line}\n`)
}

/** Loads read per page (the content snapshots can be large). */
const PAGE = 50

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || args.unknown.length > 0) {
    if (args.unknown.length > 0) process.stderr.write(`unknown argument(s): ${args.unknown.join(" ")}\n`)
    out(USAGE)
    return args.help ? 0 : 2
  }

  const envFiles = loadEnvFiles(process.cwd(), process.env.NODE_ENV)
  out(`mode: ${args.apply ? "APPLY (writes PlanItem.templateKey)" : "dry run (no writes)"}; env: ${envFiles.join(", ") || "(none)"}`)

  // Imported after the env files are loaded: the client reads DATABASE_* on creation.
  const { prisma } = await import("../src/lib/prisma")
  const { templateContentSchema } = await import("../src/lib/plan-templates/schema")
  const { planTemplateKeyBackfill } = await import("../src/lib/plan-schedule/template-key-backfill")
  const totals = { loads: 0, loadsWithRows: 0, rows: 0, matched: 0, written: 0, ambiguous: 0, unmatched: 0, alreadySet: 0, unreadable: 0, failed: 0 }
  try {
    let cursor: string | undefined
    for (;;) {
      const apps = await prisma.planTemplateApplication.findMany({
        where: args.projectId ? { projectId: args.projectId } : {},
        select: { id: true, projectId: true, templateName: true, templateVersion: true, content: true },
        orderBy: { id: "asc" },
        take: PAGE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      })
      if (apps.length === 0) break
      cursor = apps[apps.length - 1].id

      for (const app of apps) {
        totals.loads += 1
        const label = `${app.templateName} v${app.templateVersion} → project ${app.projectId} (load ${app.id})`
        try {
          const rows = await prisma.planItem.findMany({ where: { templateApplicationId: app.id }, select: { id: true, parentId: true, name: true, templateKey: true } })
          if (rows.length === 0) continue
          totals.loadsWithRows += 1
          totals.rows += rows.length
          let content
          try {
            const parsed = templateContentSchema.safeParse(JSON.parse(app.content))
            content = parsed.success ? parsed.data : null
          } catch {
            content = null
          }
          if (!content) {
            totals.unreadable += 1
            out(`[unreadable] ${label}: the stored content is not a valid template; ${rows.length} row(s) left as they are`)
            continue
          }
          const plan = planTemplateKeyBackfill(content, rows)
          totals.ambiguous += plan.counts.ambiguous
          totals.unmatched += plan.counts.unmatched
          totals.alreadySet += plan.counts.alreadySet
          let written = 0
          if (args.apply && plan.updates.length > 0) {
            written = await prisma.$transaction(async (tx) => {
              let n = 0
              for (const u of plan.updates) {
                n += (await tx.planItem.updateMany({ where: { id: u.id, templateKey: null }, data: { templateKey: u.templateKey } })).count
              }
              return n
            })
            totals.written += written
          }
          // matched = rows that got (or in a dry run would get) a key: in --apply only what was really written.
          totals.matched += args.apply ? written : plan.counts.matched
          const c = plan.counts
          out(`${label}: rows ${rows.length}, ${args.apply ? `written ${written}` : `would write ${plan.updates.length}`}, ambiguous ${c.ambiguous}, unmatched ${c.unmatched}, already set ${c.alreadySet}`)
        } catch (err) {
          totals.failed += 1
          out(`[failed] ${label}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
    }

    out(JSON.stringify(totals, null, 2))
    if (!args.apply && totals.matched > 0) out(`dry run: ${totals.matched} row(s) would get a key. Re-run with --apply to write.`)
    return totals.failed > 0 ? 1 : 0
  } finally {
    await prisma.$disconnect()
  }
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    process.stderr.write(`backfill-plan-template-keys failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`)
    process.exit(1)
  },
)
