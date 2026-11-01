import type { Actor } from "@/services/_shared/actor"
import { logActivity } from "@/services/_shared/activity"
import { defaultDb, withTransaction, type Db } from "@/services/_shared/db"
import { NotFoundError, ValidationError } from "@/services/_shared/errors"
import { parsePbiRef } from "@/services/_shared/pbi-ref"
import { defaultEvidenceKind } from "@/lib/project-features"
import * as repo from "./acceptance-criteria.repository"
import { toAcceptanceCriterionDto } from "./acceptance-criteria.view"
import {
  AC_MAX_PER_PBI,
  formatAcId,
  parseAcRef,
  type CreateAcceptanceCriterionInput,
  type UpdateAcceptanceCriterionInput,
} from "./acceptance-criteria.schemas"

/**
 * 受入基準 as items with stable ids (W5). Display id `PBI-<n>/AC-<seq>`; `seq` counts up per
 * PBI, never changes on edit and is never reused after a delete (soft delete keeps the row).
 *
 * Writes (backlog.write: PO / SM) are decided by the callers' routes / MCP tools; the services
 * here only check that the PBI and the criterion belong to the project. Activity is logged on
 * the PBI (`meta.acceptanceCriterion`).
 */

/** Pure: "" / whitespace → null, otherwise trimmed. */
function clean(v: string | null | undefined): string | null | undefined {
  if (v === undefined || v === null) return v
  const t = v.trim()
  return t === "" ? null : t
}

function hasContent(f: { given?: string | null; when?: string | null; then?: string | null; text?: string | null }): boolean {
  return [f.given, f.when, f.then, f.text].some((v) => !!v)
}

const CONTENT_REQUIRED = "Give at least one of given / when / then / text"

async function loadPbi(db: Db, projectId: string, ref: string) {
  const pbi = await repo.findPbi(db, projectId, parsePbiRef(ref))
  if (!pbi) throw new NotFoundError("PBI not found", {}, "PBI_NOT_FOUND")
  return pbi
}

async function loadCriterion(db: Db, pbi: { id: string; displayId: number }, acRef: string) {
  const pbiId = pbi.id
  const seq = parseAcRef(acRef, pbi.displayId)
  const row = seq === null ? null : await repo.findBySeq(db, pbiId, seq)
  if (!row) throw new NotFoundError("Acceptance criterion not found", {}, "AC_NOT_FOUND")
  return row
}

function labelOf(pbi: { initiative: string | null; userStory: string | null }): string {
  return (pbi.initiative || pbi.userStory || "").slice(0, 120)
}

/** The live criteria of a PBI (`pbiRef` = id, "12" or "PBI-12"), `seq` order. */
export async function listAcceptanceCriteria(projectId: string, pbiRef: string) {
  const pbi = await loadPbi(defaultDb, projectId, pbiRef)
  const rows = await repo.findLive(defaultDb, pbi.id)
  return { data: rows.map((r) => toAcceptanceCriterionDto(pbi.displayId, r)) }
}

/**
 * Add a criterion. Concurrency: READ COMMITTED transaction; the PBI row lock is taken before
 * `max(seq)` is read, so concurrent adds get distinct, increasing numbers
 * (unique (pbiId, seq) is the backstop and surfaces as a 409, never as a duplicate).
 */
export async function createAcceptanceCriterion(projectId: string, pbiRef: string, input: CreateAcceptanceCriterionInput, actor: Actor) {
  const fields = {
    given: clean(input.given) ?? null,
    when: clean(input.when) ?? null,
    then: clean(input.then) ?? null,
    text: clean(input.text) ?? null,
    evidenceKind: input.evidenceKind ?? null,
  }
  if (!hasContent(fields)) throw new ValidationError(CONTENT_REQUIRED)
  return withTransaction(
    async (tx) => {
      const pbi = await loadPbi(tx, projectId, pbiRef)
      // No kind given: the project type decides (software -> test, equipment -> inspection, process improvement -> measurement).
      if (!fields.evidenceKind) fields.evidenceKind = defaultEvidenceKind(pbi.project.projectType)
      await repo.lockPbi(tx, pbi.id)
      if ((await repo.countLive(tx, pbi.id)) >= AC_MAX_PER_PBI) {
        throw new ValidationError(`A PBI has at most ${AC_MAX_PER_PBI} acceptance criteria`, {}, "AC_LIMIT_REACHED")
      }
      const seq = (await repo.maxSeq(tx, pbi.id)) + 1
      const row = await repo.create(tx, { ...fields, pbiId: pbi.id, seq, createdById: actor.userId || null })
      const dto = toAcceptanceCriterionDto(pbi.displayId, row)
      await logActivity(tx, {
        projectId,
        entityType: "pbi",
        entityId: pbi.id,
        action: "update",
        actor,
        diff: { label: labelOf(pbi), meta: { acceptanceCriterion: dto.id, change: "added" } },
      })
      return dto
    },
    { isolationLevel: "ReadCommitted" }
  )
}

/** Edit a criterion (only the sent fields; `seq` / the display id never change). */
export async function updateAcceptanceCriterion(projectId: string, pbiRef: string, acRef: string, input: UpdateAcceptanceCriterionInput, actor: Actor) {
  return withTransaction(async (tx) => {
    const pbi = await loadPbi(tx, projectId, pbiRef)
    await repo.lockPbi(tx, pbi.id)
    const current = await loadCriterion(tx, pbi, acRef)
    const patch: Partial<repo.AcFields> = {}
    for (const key of ["given", "when", "then", "text"] as const) {
      const v = clean(input[key])
      if (v !== undefined) patch[key] = v
    }
    if (input.evidenceKind !== undefined) patch.evidenceKind = input.evidenceKind
    // Nothing sent: no write, no history row.
    if (Object.keys(patch).length === 0) return toAcceptanceCriterionDto(pbi.displayId, current)
    if (!hasContent({ ...current, ...patch })) throw new ValidationError(CONTENT_REQUIRED)
    const row = await repo.update(tx, current.id, { ...patch, updatedById: actor.userId || null })
    const dto = toAcceptanceCriterionDto(pbi.displayId, row)
    await logActivity(tx, {
      projectId,
      entityType: "pbi",
      entityId: pbi.id,
      action: "update",
      actor,
      diff: { label: labelOf(pbi), meta: { acceptanceCriterion: dto.id, change: "edited" } },
    })
    return dto
  })
}

/** Soft delete: the row stays, its `seq` is never handed out again. */
export async function deleteAcceptanceCriterion(projectId: string, pbiRef: string, acRef: string, actor: Actor, now: Date = new Date()) {
  return withTransaction(async (tx) => {
    const pbi = await loadPbi(tx, projectId, pbiRef)
    await repo.lockPbi(tx, pbi.id)
    const current = await loadCriterion(tx, pbi, acRef)
    await repo.softDelete(tx, current.id, actor.userId || null, now)
    const id = formatAcId(pbi.displayId, current.seq)
    await logActivity(tx, {
      projectId,
      entityType: "pbi",
      entityId: pbi.id,
      action: "update",
      actor,
      diff: { label: labelOf(pbi), meta: { acceptanceCriterion: id, change: "deleted" } },
    })
    return { id }
  })
}
