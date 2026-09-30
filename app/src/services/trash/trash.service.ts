/**
 * Trash views and actions. A project trash holds the project's trashed PBIs
 * and Icebox items (route: /api/projects/[projectId]/trash); trashed projects
 * are in the admin trash (/api/admin/trash/projects). Soft delete itself lives
 * in each domain service (deleteBacklogItem / deleteIceboxItem / deleteProject);
 * see src/services/_shared/soft-delete.ts.
 */
import type { EntityI18n } from "@/lib/translation/types"
import type { Actor } from "@/services/_shared/actor"
import { defaultDb } from "@/services/_shared/db"
import { purgeCutoff, resolvePurgeTrashAfterDays } from "@/services/_shared/soft-delete"
import { getI18nFor } from "@/services/_shared/translations"
import * as backlogRepo from "@/services/backlog/backlog.repository"
import { purgeBacklogItem, restoreBacklogItem } from "@/services/backlog/backlog.service"
import * as iceboxRepo from "@/services/icebox/icebox.repository"
import { purgeIceboxItem, restoreIceboxItem } from "@/services/icebox/icebox.service"
import * as projectsRepo from "@/services/projects/projects.repository"
import * as repo from "./trash.repository"
import type { TrashEntityType } from "./trash.schemas"

export interface TrashUserRef {
  id: string
  /** null when the user no longer exists. */
  name: string | null
}

export interface TrashEntryDto {
  entityType: TrashEntityType
  id: string
  displayId: number
  /** Source text of the title (`titleField` names its i18n field). */
  title: string
  titleField: "initiative" | "userStory" | "request"
  status: string
  deletedAt: string
  deletedBy: TrashUserRef | null
  /** When the purge-trash job deletes it permanently (approximate: the job runs daily). */
  purgeAt: string
  i18n: EntityI18n
}

export interface ProjectTrashDto {
  retentionDays: number
  items: TrashEntryDto[]
}

export interface TrashedProjectDto {
  id: string
  name: string
  status: string
  deletedAt: string
  deletedBy: TrashUserRef | null
  purgeAt: string
  counts: { backlogItems: number; iceboxItems: number; sprints: number }
  i18n: EntityI18n
}

export interface AdminProjectTrashDto {
  retentionDays: number
  projects: TrashedProjectDto[]
}

export interface TrashClock {
  now?: Date
  /** Defaults to PURGE_TRASH_AFTER_DAYS (30). */
  retentionDays?: number
}

function retentionOf(opts: TrashClock): number {
  return opts.retentionDays ?? resolvePurgeTrashAfterDays(process.env.PURGE_TRASH_AFTER_DAYS)
}

/** Instant the purge job deletes a row trashed at `deletedAt` (the inverse of purgeCutoff). */
function purgeAtOf(deletedAt: Date, retentionDays: number): string {
  return purgeCutoff(deletedAt, -retentionDays).toISOString()
}

function userRef(id: string | null, names: ReadonlyMap<string, string>): TrashUserRef | null {
  return id ? { id, name: names.get(id) ?? null } : null
}

function deleterIds(rows: ReadonlyArray<{ deletedById: string | null }>): string[] {
  return rows.map((r) => r.deletedById).filter((id): id is string => !!id)
}

interface TrashedRow {
  id: string
  displayId: number
  status: string
  deletedAt: Date | null
  deletedById: string | null
}

interface EntryContext {
  names: ReadonlyMap<string, string>
  i18n: ReadonlyMap<string, EntityI18n>
  retentionDays: number
}

function entryOf(
  entityType: TrashEntityType,
  row: TrashedRow,
  title: { text: string; field: TrashEntryDto["titleField"] },
  ctx: EntryContext
): TrashEntryDto {
  const deletedAt = row.deletedAt ?? new Date(0)
  return {
    entityType,
    id: row.id,
    displayId: row.displayId,
    title: title.text,
    titleField: title.field,
    status: row.status,
    deletedAt: deletedAt.toISOString(),
    deletedBy: userRef(row.deletedById, ctx.names),
    purgeAt: purgeAtOf(deletedAt, ctx.retentionDays),
    i18n: ctx.i18n.get(row.id) ?? {},
  }
}

function pbiTitle(p: { initiative: string | null; userStory: string | null }): { text: string; field: TrashEntryDto["titleField"] } {
  return p.initiative?.trim() ? { text: p.initiative, field: "initiative" } : { text: p.userStory ?? "", field: "userStory" }
}

/** The project's trashed PBIs and Icebox items, newest deletion first, with who / when. */
export async function listProjectTrash(projectId: string, opts: TrashClock = {}): Promise<ProjectTrashDto> {
  const retentionDays = retentionOf(opts)
  const [pbis, icebox] = await Promise.all([
    backlogRepo.findTrashedBacklogItems(defaultDb, projectId),
    iceboxRepo.findTrashedIceboxItems(defaultDb, projectId),
  ])
  const [names, pbiI18n, iceboxI18n] = await Promise.all([
    repo.findUserNames(defaultDb, deleterIds([...pbis, ...icebox])),
    getI18nFor("backlog_item", pbis.map((p) => p.id)),
    getI18nFor("icebox_item", icebox.map((i) => i.id)),
  ])
  const items = [
    ...pbis.map((p) => entryOf("backlog_item", p, pbiTitle(p), { names, i18n: pbiI18n, retentionDays })),
    ...icebox.map((i) => entryOf("icebox_item", i, { text: i.request, field: "request" }, { names, i18n: iceboxI18n, retentionDays })),
  ]
  return { retentionDays, items: items.toSorted((a, b) => b.deletedAt.localeCompare(a.deletedAt)) }
}

/** 404 when the item is not in this project's trash; 409 PROJECT_IN_TRASH while the project is trashed. */
export function restoreTrashItem(projectId: string, entityType: TrashEntityType, id: string, actor: Actor): Promise<void> {
  return entityType === "backlog_item" ? restoreBacklogItem(projectId, id, actor) : restoreIceboxItem(projectId, id, actor)
}

/** Permanent delete of a trashed item (files and translations included). 404 when it is not in the trash. */
export function purgeTrashItem(projectId: string, entityType: TrashEntityType, id: string, actor: Actor): Promise<void> {
  return entityType === "backlog_item" ? purgeBacklogItem(projectId, id, actor) : purgeIceboxItem(projectId, id, actor)
}

/** Every trashed project for the admin trash, newest deletion first. */
export async function listTrashedProjects(opts: TrashClock = {}): Promise<AdminProjectTrashDto> {
  const retentionDays = retentionOf(opts)
  const rows = await projectsRepo.findTrashedProjects(defaultDb)
  const [names, i18n] = await Promise.all([
    repo.findUserNames(defaultDb, deleterIds(rows)),
    getI18nFor("project", rows.map((r) => r.id)),
  ])
  return {
    retentionDays,
    projects: rows.map((p) => {
      const deletedAt = p.deletedAt ?? new Date(0)
      return {
        id: p.id,
        name: p.name,
        status: p.status,
        deletedAt: deletedAt.toISOString(),
        deletedBy: userRef(p.deletedById, names),
        purgeAt: purgeAtOf(deletedAt, retentionDays),
        counts: { ...p._count },
        i18n: i18n.get(p.id) ?? {},
      }
    }),
  }
}
