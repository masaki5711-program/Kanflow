import type { ActivityDiff } from "@/services/_shared/activity"
import { toPage, type Page } from "@/services/_shared/cursor"
import { defaultDb } from "@/services/_shared/db"
import * as repo from "./activity.repository"
import type { EntityRef, PageQuery, ProjectActivityQuery } from "./activity.schemas"

interface ActivityRow {
  id: string
  projectId: string
  entityType: string
  entityId: string
  action: string
  actorId: string | null
  actorName: string | null
  diff: string | null
  createdAt: Date
  actor: { id: string; name: string } | null
  project?: { id: string; name: string } | null
}

/** One activity entry as the API returns it. */
export interface ActivityDto {
  id: string
  projectId: string
  entityType: string
  entityId: string
  action: string
  /** Current user (name follows renames); falls back to the stored name when the user is gone. */
  actor: { id: string | null; name: string | null } | null
  changes: ActivityDiff["changes"] | null
  label: string | null
  meta: ActivityDiff["meta"] | null
  createdAt: string
  /** Only in the user feed. */
  project?: { id: string; name: string } | null
}

/** Pure: parse the stored diff JSON; malformed text → empty diff. */
export function parseDiff(text: string | null): ActivityDiff {
  if (!text) return {}
  try {
    const parsed: unknown = JSON.parse(text)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as ActivityDiff) : {}
  } catch {
    return {}
  }
}

/** Pure: DB row → DTO. */
export function toActivityDto(row: ActivityRow): ActivityDto {
  const diff = parseDiff(row.diff)
  const actor = row.actor ?? (row.actorId || row.actorName ? { id: row.actorId, name: row.actorName } : null)
  return {
    id: row.id,
    projectId: row.projectId,
    entityType: row.entityType,
    entityId: row.entityId,
    action: row.action,
    actor,
    changes: diff.changes ?? null,
    label: diff.label ?? null,
    meta: diff.meta ?? null,
    createdAt: row.createdAt.toISOString(),
    ...(row.project !== undefined ? { project: row.project } : {}),
  }
}

export async function listProjectActivity(projectId: string, query: ProjectActivityQuery): Promise<Page<ActivityDto>> {
  const rows = await repo.findProjectActivity(defaultDb, projectId, query)
  return toPage(rows, query.limit, toActivityDto)
}

export async function listEntityActivity(projectId: string, ref: EntityRef, query: PageQuery): Promise<Page<ActivityDto>> {
  const rows = await repo.findEntityActivity(defaultDb, projectId, ref.entityType, ref.entityId, query)
  return toPage(rows, query.limit, toActivityDto)
}

export async function listUserActivity(userId: string, query: PageQuery): Promise<Page<ActivityDto>> {
  const rows = await repo.findUserActivity(defaultDb, userId, query)
  return toPage(rows, query.limit, toActivityDto)
}
