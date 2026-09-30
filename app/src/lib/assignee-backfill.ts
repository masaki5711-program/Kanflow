/**
 * Pure planning step of the TaskAssignee backfill (scripts/migrate-assignees.ts).
 * Takes plain rows read from the DB and returns the rows to insert plus a
 * report of names that could not be resolved. No I/O here, so it is unit-tested.
 */
import { resolveAssignees, type AssigneeCandidate, type UnresolvedName } from "./assignees"

export interface BackfillTask {
  id: string
  projectId: string
  assignee: string | null
  /** userIds already present in TaskAssignee for this task. */
  existingUserIds: readonly string[]
}

export interface BackfillMembership {
  projectId: string
  userId: string
}

export interface BackfillReportRow extends UnresolvedName {
  taskId: string
  projectId: string
  assignee: string
}

export interface BackfillPlan {
  inserts: Array<{ taskId: string; userId: string }>
  report: BackfillReportRow[]
  stats: {
    tasksScanned: number
    tasksWithAssignee: number
    namesSeen: number
    namesResolved: number
    alreadyPresent: number
    toInsert: number
    unresolved: number
  }
}

function membersByProject(
  users: readonly AssigneeCandidate[],
  memberships: readonly BackfillMembership[],
): Map<string, AssigneeCandidate[]> {
  const byId = new Map(users.map((u) => [u.id, u]))
  const result = new Map<string, AssigneeCandidate[]>()
  for (const m of memberships) {
    const user = byId.get(m.userId)
    if (!user) continue
    result.set(m.projectId, [...(result.get(m.projectId) ?? []), user])
  }
  return result
}

/**
 * Build the insert list. Candidate scope per task is its project's members;
 * a project with no member rows falls back to every user (no membership info).
 * Rows already in TaskAssignee are skipped, so re-running is a no-op.
 */
export function planAssigneeBackfill(
  tasks: readonly BackfillTask[],
  users: readonly AssigneeCandidate[],
  memberships: readonly BackfillMembership[],
): BackfillPlan {
  const members = membersByProject(users, memberships)
  const inserts: BackfillPlan["inserts"] = []
  const report: BackfillReportRow[] = []
  let tasksWithAssignee = 0
  let namesSeen = 0
  let namesResolved = 0
  let alreadyPresent = 0

  for (const task of tasks) {
    const raw = task.assignee?.trim()
    if (!raw) continue
    tasksWithAssignee++
    const scope = members.get(task.projectId)
    const resolution = scope ? resolveAssignees(raw, scope, users) : resolveAssignees(raw, users)
    namesSeen += resolution.userIds.length + resolution.unresolved.length
    namesResolved += resolution.userIds.length
    const existing = new Set(task.existingUserIds)
    for (const userId of resolution.userIds) {
      if (existing.has(userId)) alreadyPresent++
      else inserts.push({ taskId: task.id, userId })
    }
    for (const u of resolution.unresolved) {
      report.push({ ...u, taskId: task.id, projectId: task.projectId, assignee: raw })
    }
  }

  return {
    inserts,
    report,
    stats: {
      tasksScanned: tasks.length,
      tasksWithAssignee,
      namesSeen,
      namesResolved,
      alreadyPresent,
      toInsert: inserts.length,
      unresolved: report.length,
    },
  }
}

function csvCell(value: string): string {
  // Neutralize spreadsheet formula injection, then quote when needed.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/** CSV (header + rows, CRLF, UTF-8 BOM so Excel opens Japanese text correctly). */
export function backfillReportCsv(rows: readonly BackfillReportRow[]): string {
  const header = ["taskId", "projectId", "name", "reason", "candidateIds", "assignee"]
  const lines = rows.map((r) =>
    [r.taskId, r.projectId, r.name, r.reason, r.candidateIds.join(" "), r.assignee].map(csvCell).join(","),
  )
  return `﻿${[header.join(","), ...lines].join("\r\n")}\r\n`
}
