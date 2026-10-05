/**
 * Plan template access rules and DTOs. Pure.
 *
 * Who may do what (docs/authorization.md, "Plan templates"):
 *   view / edit content : public → any logged-in user; private → owner + admins
 *   change visibility   : owner + admins (built-ins are always public)
 *   delete              : user templates only, owner + admins
 *   reset to default    : built-ins only, anyone who can view
 */
import { countNodes, parseTemplateContent, type PlanTemplateContent, type TemplateNode } from "@/lib/plan-templates/schema"
import type { Actor } from "@/services/_shared/actor"

/** A plan_template row as loaded. */
export interface TemplateRow {
  id: string
  builtinKey: string | null
  name: string
  description: string | null
  visibility: string
  ownerId: string | null
  ownerName: string | null
  content: string
  version: number
  createdAt: Date
  updatedAt: Date
  updatedById: string | null
  updatedByName: string | null
  deletedAt: Date | null
}

const isAdmin = (actor: Actor) => actor.systemRole === "admin"
const isOwner = (row: Pick<TemplateRow, "ownerId">, actor: Actor) => row.ownerId !== null && row.ownerId === actor.userId

export function canViewTemplate(row: Pick<TemplateRow, "visibility" | "ownerId" | "deletedAt">, actor: Actor): boolean {
  if (row.deletedAt) return false
  return row.visibility === "public" || isOwner(row, actor) || isAdmin(actor)
}

export function canChangeVisibility(row: Pick<TemplateRow, "builtinKey" | "ownerId">, actor: Actor): boolean {
  return row.builtinKey === null && (isOwner(row, actor) || isAdmin(actor))
}

export function canDeleteTemplate(row: Pick<TemplateRow, "builtinKey" | "ownerId">, actor: Actor): boolean {
  return row.builtinKey === null && (isOwner(row, actor) || isAdmin(actor))
}

function hasDurations(nodes: readonly TemplateNode[]): boolean {
  return nodes.some((n) => n.durationDays !== undefined || hasDurations(n.children ?? []))
}

export interface PlanTemplateSummaryDto {
  id: string
  builtinKey: string | null
  isBuiltin: boolean
  name: string
  description: string | null
  visibility: "public" | "private"
  owner: { id: string; name: string | null } | null
  /** Top-level stages. */
  stageCount: number
  /** Stages at every level. */
  nodeCount: number
  hasDurations: boolean
  version: number
  updatedAt: string
  updatedByName: string | null
  isMine: boolean
  canChangeVisibility: boolean
  canDelete: boolean
}

export interface PlanTemplateDto extends PlanTemplateSummaryDto {
  content: PlanTemplateContent
}

function summaryOf(row: TemplateRow, actor: Actor, content: PlanTemplateContent): PlanTemplateSummaryDto {
  return {
    id: row.id,
    builtinKey: row.builtinKey,
    isBuiltin: row.builtinKey !== null,
    name: row.name,
    description: row.description,
    visibility: row.visibility === "private" ? "private" : "public",
    owner: row.ownerId ? { id: row.ownerId, name: row.ownerName } : null,
    stageCount: content.stages.length,
    nodeCount: countNodes(content.stages),
    hasDurations: hasDurations(content.stages),
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
    updatedByName: row.updatedByName,
    isMine: isOwner(row, actor),
    canChangeVisibility: canChangeVisibility(row, actor),
    canDelete: canDeleteTemplate(row, actor),
  }
}

export function toTemplateDto(row: TemplateRow, actor: Actor): PlanTemplateDto {
  const content = parseTemplateContent(row.content)
  return { ...summaryOf(row, actor, content), content }
}

export function toTemplateSummaryDto(row: TemplateRow, actor: Actor): PlanTemplateSummaryDto {
  return summaryOf(row, actor, parseTemplateContent(row.content))
}

export interface TemplateRevisionRow {
  id: string
  templateId: string
  version: number
  name: string
  description: string | null
  visibility: string
  content: string
  action: string
  editedById: string | null
  editedByName: string | null
  editedAt: Date
}

export interface TemplateRevisionDto {
  id: string
  version: number
  name: string
  description: string | null
  action: string
  editedBy: { id: string; name: string | null } | null
  editedAt: string
  /** Only when one revision is requested (?revisionId=). */
  content?: PlanTemplateContent
}

export function toRevisionDto(row: Omit<TemplateRevisionRow, "content"> & { content?: string }, withContent: boolean): TemplateRevisionDto {
  return {
    id: row.id,
    version: row.version,
    name: row.name,
    description: row.description,
    action: row.action,
    editedBy: row.editedById ? { id: row.editedById, name: row.editedByName } : null,
    editedAt: row.editedAt.toISOString(),
    ...(withContent && row.content !== undefined && { content: parseTemplateContent(row.content) }),
  }
}
