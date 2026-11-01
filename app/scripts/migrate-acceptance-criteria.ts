/**
 * One-off, re-runnable migration (W5): ProductBacklogItem.acceptanceCriteria (free text)
 *   → acceptance_criterion rows (PBI-<n>/AC-<seq>).      (migration 20261101140000)
 *
 *   node --import tsx scripts/migrate-acceptance-criteria.ts             dry run (default): plan only, no writes
 *   node --import tsx scripts/migrate-acceptance-criteria.ts --apply     write the planned rows
 *   node --import tsx scripts/migrate-acceptance-criteria.ts --project <id>   limit to one project
 *
 * Run from the app directory (.env files are read from the working directory, like the worker).
 * Requires the 20261101140000_acceptance_criterion migration to be applied first.
 *
 * Splitting (src/services/acceptance-criteria/acceptance-criteria.split.ts): bullet / numbered
 * lines become items, text without markers stays ONE item. The items go into `text` (Given /
 * When / Then stay empty); the PO can refine them in the PBI screen.
 *
 * Idempotent: a PBI that has ANY criterion row (deleted ones included) is skipped, so a re-run
 * never duplicates and never brings back a deleted item. The check is repeated under the PBI
 * row lock inside the write transaction, so it is also safe next to live edits. The old
 * `acceptanceCriteria` column is never modified (deprecated, read-only). New PBIs created
 * with the old field after a run are picked up by the next run.
 */
import { loadEnvFiles } from "../src/worker/config"
import { planAcceptanceCriteriaBackfill, type BackfillPbi } from "../src/services/acceptance-criteria/acceptance-criteria.backfill"

const USAGE = `usage: node --import tsx scripts/migrate-acceptance-criteria.ts [--dry-run | --apply] [--project <id>]`
const PAGE = 500

function out(line: string): void {
  process.stdout.write(`${line}\n`)
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  let apply = false
  let projectId: string | null = null
  const unknown: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--apply") apply = true
    else if (a === "--dry-run") apply = false
    else if (a === "--project" && argv[i + 1]) projectId = argv[++i]
    else if (a === "--help" || a === "-h") {
      out(USAGE)
      return 0
    } else unknown.push(a)
  }
  if (unknown.length > 0) {
    process.stderr.write(`unknown argument(s): ${unknown.join(" ")}\n${USAGE}\n`)
    return 2
  }

  const envFiles = loadEnvFiles(process.cwd(), process.env.NODE_ENV)
  out(`mode: ${apply ? "APPLY (writes acceptance_criterion rows)" : "dry run (no writes)"}; env: ${envFiles.join(", ") || "(none)"}`)

  // Imported after the env files are loaded: the client reads DATABASE_* on creation.
  const { prisma } = await import("../src/lib/prisma")
  const { lockPbi } = await import("../src/services/acceptance-criteria/acceptance-criteria.repository")
  try {
    const pbis: BackfillPbi[] = []
    for (let cursor: string | undefined; ; ) {
      const rows = await prisma.productBacklogItem.findMany({
        where: { acceptanceCriteria: { not: null }, ...(projectId ? { projectId } : {}) },
        select: { id: true, displayId: true, acceptanceCriteria: true, _count: { select: { criteria: true } } },
        orderBy: { id: "asc" },
        take: PAGE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      })
      for (const r of rows) pbis.push({ id: r.id, displayId: r.displayId, acceptanceCriteria: r.acceptanceCriteria, existingRows: r._count.criteria })
      if (rows.length < PAGE) break
      cursor = rows[rows.length - 1].id
    }

    const plan = planAcceptanceCriteriaBackfill(pbis)
    out(JSON.stringify(plan.stats, null, 2))
    if (!apply) {
      out(`dry run: ${plan.inserts.length} item(s) in ${plan.stats.migrated} PBI(s) would be written. Re-run with --apply to write.`)
      return 0
    }

    const byPbi = new Map<string, typeof plan.inserts>()
    for (const row of plan.inserts) byPbi.set(row.pbiId, [...(byPbi.get(row.pbiId) ?? []), row])
    let written = 0
    let skipped = 0
    for (const [pbiId, rows] of byPbi) {
      await prisma.$transaction(
        async (tx) => {
          await lockPbi(tx, pbiId)
          // Re-checked under the lock: a PO may have added an item since the plan was read.
          if ((await tx.acceptanceCriterion.count({ where: { pbiId } })) > 0) {
            skipped++
            return
          }
          const result = await tx.acceptanceCriterion.createMany({ data: rows.map((r) => ({ pbiId, seq: r.seq, text: r.text })) })
          written += result.count
        },
        { isolationLevel: "ReadCommitted" },
      )
    }
    out(`applied: wrote ${written} item(s); skipped ${skipped} PBI(s) that gained items meanwhile.`)
    return 0
  } finally {
    await prisma.$disconnect()
  }
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    process.stderr.write(`migrate-acceptance-criteria failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`)
    process.exit(1)
  },
)
