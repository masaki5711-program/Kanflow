import { parseTemplateContent } from "@/lib/plan-templates/schema"
import { MS_MAX_CHECKS, MS_MAX_DOCUMENTS } from "@/lib/milestones/constants"
import { defaultDb, withTransaction, type Db } from "@/services/_shared/db"
import { isUniqueViolation } from "@/services/_shared/errors"
import * as parts from "./milestones.parts.repository"
import * as repo from "./milestones.repository"

/**
 * Seeding of the board from template loads — LAZY and idempotent: the first
 * board read after a load (POST /plan/templates/apply) copies that load's
 * content snapshot (checks with criteria, 引き渡し資料, check 呼び名, 予算 flag;
 * 推移 on for the 長期品質改善 built-in) onto the board, once per load.
 *
 * Why lazy instead of a hook in the apply service: loads made before the
 * board existed are covered too, and the plan-template service stays free of
 * board concerns. Idempotency: a milestone_board_seed row per load is
 * inserted FIRST in the seeding transaction, so a concurrent reader fails on
 * the primary key and rolls back. Names already on the board are skipped (a
 * template loaded twice adds nothing twice); rows the user deleted after
 * seeding are never re-created.
 */

type Application = Awaited<ReturnType<typeof repo.findApplications>>[number]

/** The 長期品質改善 built-in template turns the 推移 tab on. */
const TREND_BUILTIN_KEYS = new Set(["quality"])

function freshNames(wanted: readonly string[], existing: ReadonlyArray<{ name: string }>, room: number): string[] {
  const seen = new Set(existing.map((e) => e.name.trim()))
  const out: string[] = []
  for (const name of wanted.map((n) => n.trim())) {
    if (!name || seen.has(name) || out.length >= room) continue
    seen.add(name)
    out.push(name)
  }
  return out
}

async function seedChecks(tx: Db, projectId: string, checks: ReadonlyArray<{ name: string; criterion?: string }>): Promise<void> {
  const existing = await parts.findCheckNames(tx, projectId)
  const names = freshNames(checks.map((c) => c.name), existing, MS_MAX_CHECKS - existing.length)
  for (const name of names) {
    const criterion = checks.find((c) => c.name.trim() === name)?.criterion?.trim() || null
    await parts.insertCheck(tx, { projectId, name, criterion })
  }
}

async function seedDocuments(tx: Db, projectId: string, documents: readonly string[]): Promise<void> {
  const existing = await parts.findDocumentNames(tx, projectId)
  for (const name of freshNames(documents, existing, MS_MAX_DOCUMENTS - existing.length)) await parts.insertDocument(tx, projectId, name)
}

/** Settings only ever switch ON from a template; a label is taken when none is set yet. */
async function seedSettings(tx: Db, projectId: string, app: Application, content: ReturnType<typeof parseTemplateContent>): Promise<void> {
  const current = await repo.findSettings(tx, projectId)
  const trend = TREND_BUILTIN_KEYS.has(app.template.builtinKey ?? "")
  const data = {
    ...(!current?.checkLabel && content.checkLabel ? { checkLabel: content.checkLabel } : {}),
    ...(content.budgetEnabled && !current?.budgetEnabled ? { budgetEnabled: true } : {}),
    ...(trend && !current?.trendEnabled ? { trendEnabled: true } : {}),
  }
  if (Object.keys(data).length > 0 || !current) await repo.upsertSettings(tx, projectId, data)
}

/** Seed one load; false when another request already did (or does) it. */
async function seedApplication(projectId: string, app: Application): Promise<boolean> {
  const content = parseTemplateContent(app.content)
  try {
    await withTransaction(async (tx) => {
      await parts.insertSeedMarker(tx, app.id, projectId)
      await seedChecks(tx, projectId, content.checks ?? [])
      await seedDocuments(tx, projectId, content.documents ?? [])
      await seedSettings(tx, projectId, app, content)
    })
    return true
  } catch (err) {
    if (isUniqueViolation(err)) return false
    throw err
  }
}

/** Seed every not-yet-seeded load of the project (oldest first). Returns how many were seeded. */
export async function ensureSeeded(projectId: string, apps?: readonly Application[]): Promise<number> {
  const list = apps ?? (await repo.findApplications(defaultDb, projectId))
  let seeded = 0
  for (const app of list.filter((a) => !a.milestoneSeed)) {
    if (await seedApplication(projectId, app)) seeded += 1
  }
  return seeded
}
