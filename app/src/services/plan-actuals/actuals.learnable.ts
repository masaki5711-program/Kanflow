/**
 * THE one path from frozen actuals to learning (plan 12 §2.2, design review HIGH 5): `learnableItemFacts`. Everything
 * that learns from finished projects (E2 estimate, E4 m_u / ℓ̂, backtests) reads snapshot leaves through here, so the
 * use-time confidentiality check cannot be skipped. Nothing else reads plan_actuals_item_pbi / _repo
 * (`item_facts_only_via_learnable_item_facts` pins that).
 *
 * The result is an INTERNAL learning projection: it carries other projects' leaf names and the owner / concurrency
 * numbers of m_u learning. It must never be sent to a screen, an API response, MCP or an LLM as is — a caller that
 * shows evidence builds its own allowlisted view (plan 12 §4). `boundary.test.ts` keeps it out of src/app.
 *
 * Per leaf, at the moment of use:
 * - only CURRENT snapshots (not superseded) that are included in learning, and only complete leaves;
 * - each cited PBI is re-read: confidential now, trashed or gone → treated as confidential and left out;
 * - a leaf whose PBIs are ALL confidential is not learned from at all; a partly confidential one loses those PBIs'
 *   hours and MR numbers;
 * - an unknown stays unknown (an unreadable repository's numbers are null, not 0);
 * - a leaf a PO / SM marked from an AI review proposal (learningUse): `excluded` is not learned from at all; `waiting`
 *   is learned as if the work took its planned days, the overrun counting as waiting before the leaf (waitGapDays).
 */
import { loadObserved, median } from "@/lib/plan-actuals/compute"
import type { Observation } from "@/lib/plan-estimate/types"
import { defaultDb, type Db } from "@/services/_shared/db"

export interface LearnableFact extends Observation {
  /** The leaf's role (what m_u / evidence use instead of the owner). */
  role: string | null
  /** Owner (or "role:<name>" once pseudonymised): m_u learning only, never displayed. */
  ownerId: string | null
  ownerConcurrentAvg: number | null
  ownerConcurrentPeak: number | null
  effortHours: number | null
  /** How many cited PBIs were left out as confidential (for the evidence screen's "一部を除外" note). */
  excludedPbiCount: number
  /** Present only when a PO / SM accepted "treat as waiting" for the leaf (the run's input hash records it). */
  learningUse?: "waiting"
}

/** Leaves a PO / SM excluded from learning (an accepted AI review proposal) are never learned from. */
const NOT_EXCLUDED = { OR: [{ learningUse: null }, { learningUse: { not: "excluded" } }] }

/** Leaves read at once (a lineage rarely has more). Past it the caller must narrow the request — never a silent subset. */
const FACTS_MAX = 20_000
/** Ids per IN list (bind-parameter limit). */
const IN_CHUNK = 5_000

function chunks<T>(values: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size))
  return out
}

export class LearnableFactsLimitError extends Error {
  constructor(count: number) {
    super(`more than ${FACTS_MAX} snapshot leaves requested (${count}); narrow the request`)
    this.name = "LearnableFactsLimitError"
  }
}

export async function learnableItemFacts(snapshotItemIds: readonly string[], db: Db = defaultDb): Promise<LearnableFact[]> {
  const ids = [...new Set(snapshotItemIds)]
  if (ids.length === 0) return []
  if (ids.length > FACTS_MAX) throw new LearnableFactsLimitError(ids.length)
  const items = (
    await Promise.all(
      chunks(ids, IN_CHUNK).map((part) =>
        db.planActualsItem.findMany({
          where: { id: { in: part }, complete: true, ...NOT_EXCLUDED, snapshot: { supersededAt: null, includeInLearning: true } },
          orderBy: { id: "asc" },
          include: {
            snapshot: { select: { projectId: true, lineage: true, projectType: true, closedAt: true, firstFinalizedAt: true } },
            pbis: true,
            repos: true,
          },
        }),
      ),
    )
  ).flat()
  const pbiIds = [...new Set(items.flatMap((i) => i.pbis.map((p) => p.backlogItemId)))]
  const projectIds = [...new Set(items.map((i) => i.snapshot.projectId))]
  const [live, attributes] = await Promise.all([
    Promise.all(chunks(pbiIds, IN_CHUNK).map((part) => db.productBacklogItem.findMany({ where: { id: { in: part } }, select: { id: true, confidential: true, deletedAt: true } }))).then((r) => r.flat()),
    projectIds.length ? db.projectAttribute.findMany({ where: { projectId: { in: projectIds } }, select: { projectId: true, kind: true, ref: true } }) : [],
  ])
  // Fail closed: a PBI that is gone, trashed or confidential NOW is confidential.
  const visible = new Set(live.filter((p) => !p.confidential && p.deletedAt === null).map((p) => p.id))
  const attrsBy = new Map<string, string[]>()
  for (const a of attributes) attrsBy.set(a.projectId, [...(attrsBy.get(a.projectId) ?? []), `${a.kind}:${a.ref}`])

  const out: LearnableFact[] = []
  for (const it of items) {
    if (it.actualDays === null || it.plannedDays === null) continue
    // Fail closed: a learningUse this code does not know is not learned from.
    if (it.learningUse !== null && it.learningUse !== "waiting") continue
    const waiting = it.learningUse === "waiting"
    // Treated as waiting: the work took its planned days; the overrun is waiting before the leaf (never negative).
    const overrun = waiting ? Math.max(it.actualDays - it.plannedDays, 0) : 0
    const actualDays = it.actualDays - overrun
    const usable = it.pbis.filter((p) => visible.has(p.backlogItemId))
    if (it.pbis.length > 0 && usable.length === 0) continue
    const usableIds = new Set(usable.map((p) => p.backlogItemId))
    // One usable PBI with unknown effort makes the leaf's effort unknown (a partial sum would look measured).
    const efforts = usable.map((p) => p.effortHours)
    const effortHours = efforts.length && efforts.every((h): h is number => h !== null) ? Math.round(efforts.reduce((a, b) => a + b, 0) * 100) / 100 : null
    // An unreadable repository (mrCount null) makes the MR numbers unknown for the whole leaf.
    const mrUnknown = usable.some((p) => p.mrCount === null)
    const leads = usable.map((p) => p.mrSetLeadTimeHours).filter((h): h is number => h !== null)
    const repoRows = it.repos.filter((r) => usableIds.has(r.backlogItemId))
    const repoTouched = mrUnknown || repoRows.some((r) => r.mrCount === null) ? null : new Set(repoRows.filter((r) => (r.mrCount ?? 0) > 0).map((r) => r.repositoryId)).size
    out.push({
      snapshotItemId: it.id,
      sourceProjectId: it.snapshot.projectId,
      lineage: it.snapshot.lineage,
      projectType: it.snapshot.projectType,
      templateKey: it.templateKey,
      name: it.name,
      attributes: attrsBy.get(it.snapshot.projectId) ?? [],
      plannedDays: it.plannedDays,
      actualDays,
      closedAt: it.snapshot.closedAt.toISOString().slice(0, 10),
      finalizedAt: it.snapshot.firstFinalizedAt.toISOString().slice(0, 10),
      waitGapDays: waiting ? (it.waitGapDays ?? 0) + overrun : it.waitGapDays,
      loadObserved: loadObserved(effortHours, actualDays),
      repoTouched: usable.length ? repoTouched : null,
      mrSetLeadTimeHours: mrUnknown ? null : median(leads),
      role: it.role,
      ownerId: it.ownerId,
      ownerConcurrentAvg: it.ownerConcurrentAvg,
      ownerConcurrentPeak: it.ownerConcurrentPeak,
      effortHours,
      excludedPbiCount: it.pbis.length - usable.length,
      ...(waiting ? { learningUse: "waiting" as const } : {}),
    })
  }
  return out
}

/** Leaf ids of every current, learnable snapshot of a lineage (and / or project type) — then call learnableItemFacts. */
export async function learnableItemIds(filter: { lineage?: string; projectType?: string }, db: Db = defaultDb): Promise<string[]> {
  const rows = await db.planActualsItem.findMany({
    where: { complete: true, ...NOT_EXCLUDED, snapshot: { supersededAt: null, includeInLearning: true, ...(filter.lineage ? { lineage: filter.lineage } : {}), ...(filter.projectType ? { projectType: filter.projectType } : {}) } },
    select: { id: true },
    orderBy: { id: "asc" },
    take: FACTS_MAX + 1,
  })
  if (rows.length > FACTS_MAX) throw new LearnableFactsLimitError(rows.length)
  return rows.map((r) => r.id)
}

/**
 * Of the given snapshot leaves, those citing at least one PBI that is confidential, trashed or gone NOW (fail closed) —
 * for the AI review of actuals (D-5: such a leaf, even its name, never reaches the LLM, and the quote of a proposal on
 * it is not shown). Read here so the PBI rows stay behind this file (item_facts_only_via_learnable_item_facts).
 */
export async function leavesCitingConfidentialPbis(snapshotItemIds: readonly string[], db: Db = defaultDb): Promise<Set<string>> {
  const ids = [...new Set(snapshotItemIds)]
  if (ids.length === 0) return new Set()
  if (ids.length > FACTS_MAX) throw new LearnableFactsLimitError(ids.length)
  const cited = (await Promise.all(chunks(ids, IN_CHUNK).map((part) => db.planActualsItemPbi.findMany({ where: { snapshotItemId: { in: part } }, select: { snapshotItemId: true, backlogItemId: true } })))).flat()
  const pbiIds = [...new Set(cited.map((c) => c.backlogItemId))]
  const live = (await Promise.all(chunks(pbiIds, IN_CHUNK).map((part) => db.productBacklogItem.findMany({ where: { id: { in: part } }, select: { id: true, confidential: true, deletedAt: true } })))).flat()
  const visible = new Set(live.filter((p) => !p.confidential && p.deletedAt === null).map((p) => p.id))
  return new Set(cited.filter((c) => !visible.has(c.backlogItemId)).map((c) => c.snapshotItemId))
}
