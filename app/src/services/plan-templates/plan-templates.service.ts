/**
 * Plan templates (計画テンプレート): list / get / create / edit / delete /
 * reset / duplicate / edit history. Project-side operations (load into a
 * plan, save a plan as a template, 仮置き): ./plan-templates.apply.ts.
 * Access rules: ./plan-templates.dto.ts.
 */
import { BUILTIN_KEYS, BUILTIN_TEMPLATES, builtinByKey } from "@/lib/plan-templates/builtins"
import { TEMPLATE_MAX_JSON_CHARS, serializeTemplateContent, type PlanTemplateContent } from "@/lib/plan-templates/schema"
import { logger } from "@/lib/logger"
import type { Actor } from "@/services/_shared/actor"
import { defaultDb, withTransaction, type Db } from "@/services/_shared/db"
import { ForbiddenError, NotFoundError, StatusError, ValidationError, VersionConflictError, isUniqueViolation } from "@/services/_shared/errors"
import { noteUnversionedWrite, staleOrMissing } from "@/services/_shared/versioning"
import {
  canChangeVisibility,
  canDeleteTemplate,
  canViewTemplate,
  toRevisionDto,
  toTemplateDto,
  toTemplateSummaryDto,
  type PlanTemplateDto,
  type PlanTemplateSummaryDto,
  type TemplateRevisionDto,
  type TemplateRow,
} from "./plan-templates.dto"
import * as repo from "./plan-templates.repository"
import type { CreateTemplateInput, DuplicateTemplateInput, TemplateVisibility, UpdateTemplateInput } from "./plan-templates.schemas"

const log = logger.child({ module: "plan-templates" })

/** 404 PLAN_TEMPLATE_NOT_FOUND (missing, deleted, or private to someone else). */
export const templateNotFound = () => new NotFoundError("Not found", {}, "PLAN_TEMPLATE_NOT_FOUND")

/** Serialized content, or 413 when it is over the size bound. */
export function contentJson(content: PlanTemplateContent): string {
  const json = serializeTemplateContent(content)
  if (json.length > TEMPLATE_MAX_JSON_CHARS) throw new StatusError(413, "テンプレートが大きすぎます", {}, "PAYLOAD_TOO_LARGE")
  return json
}

// ── built-in seeding ────────────────────────────────────────────────────────

let builtinsSeeded = false

/** Insert the missing built-in templates (with a "create" revision). Idempotent; concurrent seeders are tolerated. */
export async function ensureBuiltinTemplates(db: Db = defaultDb): Promise<void> {
  if (builtinsSeeded) return
  const existing = new Set((await repo.findBuiltinKeys(db)).map((r) => r.builtinKey))
  for (const b of BUILTIN_TEMPLATES.filter((t) => !existing.has(t.key))) {
    try {
      await withTransaction(async (tx) => {
        const row = await repo.insertTemplate(tx, { builtinKey: b.key, name: b.name, description: b.description, visibility: "public", content: contentJson(b.content) })
        await recordRevision(tx, row, "create", null)
      })
    } catch (err) {
      if (!isUniqueViolation(err)) throw err
      log.debug("built-in template seeded concurrently", { key: b.key })
    }
  }
  builtinsSeeded = true
}

/** Tests only. */
export function resetBuiltinSeedFlag(): void {
  builtinsSeeded = false
}

// ── helpers ─────────────────────────────────────────────────────────────────

async function recordRevision(tx: Db, row: TemplateRow, action: "create" | "update" | "reset" | "duplicate", actor: Actor | null): Promise<void> {
  await repo.insertRevision(tx, {
    templateId: row.id,
    version: row.version,
    name: row.name,
    description: row.description,
    visibility: row.visibility,
    content: row.content,
    action,
    editedById: actor?.userId ?? null,
    editedByName: actor?.userName ?? null,
  })
  await repo.pruneRevisions(tx, row.id)
}

/** A live template the actor may see, or 404. */
export async function loadVisibleTemplate(db: Db, id: string, actor: Actor): Promise<TemplateRow> {
  const row = await repo.findTemplate(db, id)
  if (!row || !canViewTemplate(row, actor)) throw templateNotFound()
  return row
}

const builtinRank = (key: string | null) => (key === null ? BUILTIN_KEYS.length : BUILTIN_KEYS.indexOf(key as (typeof BUILTIN_KEYS)[number]))

// ── reads ───────────────────────────────────────────────────────────────────

/** Built-ins first (shipped order), then the rest by last update. */
export async function listTemplates(actor: Actor): Promise<PlanTemplateSummaryDto[]> {
  await ensureBuiltinTemplates()
  const rows = await repo.findVisibleTemplates(defaultDb, actor.userId, actor.systemRole === "admin")
  return rows
    .toSorted((a, b) => builtinRank(a.builtinKey) - builtinRank(b.builtinKey) || b.updatedAt.getTime() - a.updatedAt.getTime())
    .map((r) => toTemplateSummaryDto(r, actor))
}

export async function getTemplate(id: string, actor: Actor): Promise<PlanTemplateDto> {
  return toTemplateDto(await loadVisibleTemplate(defaultDb, id, actor), actor)
}

/** Edit history, newest first; `revisionId` = one snapshot with its content. */
export async function listRevisions(id: string, actor: Actor, revisionId?: string): Promise<TemplateRevisionDto[]> {
  await loadVisibleTemplate(defaultDb, id, actor)
  if (revisionId) {
    const rev = await repo.findRevision(defaultDb, id, revisionId)
    if (!rev) throw new NotFoundError("Not found", {}, "NOT_FOUND")
    return [toRevisionDto(rev, true)]
  }
  return (await repo.findRevisions(defaultDb, id)).map((r) => toRevisionDto(r, false))
}

// ── writes ──────────────────────────────────────────────────────────────────

interface NewTemplate {
  name: string
  description: string | null
  visibility: TemplateVisibility
  content: PlanTemplateContent
}

/** Insert a user template owned by the actor (+ its first revision). */
export async function insertUserTemplate(tx: Db, data: NewTemplate, actor: Actor, action: "create" | "duplicate"): Promise<TemplateRow> {
  const row = await repo.insertTemplate(tx, {
    name: data.name,
    description: data.description,
    visibility: data.visibility,
    ownerId: actor.userId,
    ownerName: actor.userName,
    content: contentJson(data.content),
    updatedById: actor.userId,
    updatedByName: actor.userName,
  })
  await recordRevision(tx, row, action, actor)
  return row
}

export async function createTemplate(input: CreateTemplateInput, actor: Actor): Promise<PlanTemplateDto> {
  const row = await withTransaction((tx) => insertUserTemplate(tx, { ...input, description: input.description ?? null }, actor, "create"))
  return toTemplateDto(row, actor)
}

async function versionedWrite(
  tx: Db,
  existing: TemplateRow,
  data: Parameters<typeof repo.updateTemplateVersioned>[2],
  version: number | undefined,
  actor: Actor,
): Promise<TemplateRow> {
  const updated = await repo.updateTemplateVersioned(tx, existing.id, { ...data, updatedById: actor.userId, updatedByName: actor.userName }, version)
  if (updated) return updated
  const current = await repo.findTemplate(tx, existing.id)
  throw staleOrMissing(current && toTemplateDto(current, actor), templateNotFound)
}

/** Full replace. Visibility changes: owner / admin only, never on built-ins (403). */
export async function updateTemplate(id: string, input: UpdateTemplateInput, actor: Actor): Promise<PlanTemplateDto> {
  noteUnversionedWrite("plan_template", id, input.version)
  const row = await withTransaction(async (tx) => {
    const existing = await loadVisibleTemplate(tx, id, actor)
    if (input.version !== undefined && existing.version !== input.version) throw new VersionConflictError(toTemplateDto(existing, actor))
    const visibilityChanged = input.visibility !== undefined && input.visibility !== existing.visibility
    if (visibilityChanged && !canChangeVisibility(existing, actor)) throw new ForbiddenError("公開範囲を変更できるのは作成者または管理者だけです", {}, "FORBIDDEN")
    const updated = await versionedWrite(
      tx,
      existing,
      { name: input.name, description: input.description ?? null, content: contentJson(input.content), ...(visibilityChanged && { visibility: input.visibility }) },
      input.version,
      actor,
    )
    await recordRevision(tx, updated, "update", actor)
    return updated
  })
  return toTemplateDto(row, actor)
}

/** 「デフォルトに戻す」: a built-in gets its shipped name / description / content back (new revision). */
export async function resetTemplate(id: string, version: number | undefined, actor: Actor): Promise<PlanTemplateDto> {
  const row = await withTransaction(async (tx) => {
    const existing = await loadVisibleTemplate(tx, id, actor)
    const builtin = builtinByKey(existing.builtinKey)
    if (!builtin) throw new ValidationError("デフォルトに戻せるのは共通テンプレートだけです", {}, "PLAN_TEMPLATE_NOT_BUILTIN")
    const updated = await versionedWrite(tx, existing, { name: builtin.name, description: builtin.description, content: contentJson(builtin.content) }, version, actor)
    await recordRevision(tx, updated, "reset", actor)
    return updated
  })
  return toTemplateDto(row, actor)
}

/** Built-ins: 400 PLAN_TEMPLATE_BUILTIN. Others: owner / admin, else 403 PLAN_TEMPLATE_DELETE_FORBIDDEN. */
export async function deleteTemplate(id: string, actor: Actor, now: Date = new Date()): Promise<void> {
  const existing = await loadVisibleTemplate(defaultDb, id, actor)
  if (existing.builtinKey !== null) throw new ValidationError("共通テンプレートは削除できません", {}, "PLAN_TEMPLATE_BUILTIN")
  if (!canDeleteTemplate(existing, actor)) throw new ForbiddenError("作成者または管理者だけが削除できます", {}, "PLAN_TEMPLATE_DELETE_FORBIDDEN")
  if (!(await repo.softDeleteTemplate(defaultDb, id, now))) throw templateNotFound()
}

/** A copy owned by the actor (any visible template, built-ins included). */
export async function duplicateTemplate(id: string, input: DuplicateTemplateInput, actor: Actor): Promise<PlanTemplateDto> {
  const row = await withTransaction(async (tx) => {
    const source = toTemplateDto(await loadVisibleTemplate(tx, id, actor), actor)
    const name = input.name ?? `${source.name}（コピー）`.slice(0, 255)
    return insertUserTemplate(tx, { name, description: source.description, visibility: input.visibility, content: source.content }, actor, "duplicate")
  })
  return toTemplateDto(row, actor)
}
