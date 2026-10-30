import { prisma } from "@/lib/prisma"
import { pbiKey } from "@/lib/git/pbi-keys"
import { NotFoundError } from "@/services/_shared/errors"
import type { Actor } from "@/services/_shared/actor"
import { updateTask } from "@/services/sprint-backlog/sprint-backlog.service"
import { isGitEnabled } from "./git.service"
import { deriveGitHints, type InsightHint } from "./git-insights-rules"
import { draftWindowHours, formatDailyScrumDraft, formatReleaseNote, type ActivityPbi, type ReportLang } from "./git-reports"

/**
 * Read models that turn the Git links of a sprint's PBIs into suggestions
 * (start / complete tasks, failed pipeline, stale review), a Daily Scrum draft
 * and a release note. Placeholder rows (no task name) only mark membership.
 */
const DAY_MS = 86_400_000

interface SprintPbi {
  id: string
  displayId: number
  title: string
  tasks: Array<{ id: string; status: string }>
}

async function loadSprintPbis(projectId: string, sprintId: string) {
  const sprint = await prisma.sprint.findFirst({
    where: { id: sprintId, projectId },
    select: {
      sprintName: true,
      startDate: true,
      endDate: true,
      items: {
        where: { pbItem: { deletedAt: null } },
        select: { id: true, taskName: true, status: true, pbItem: { select: { id: true, displayId: true, initiative: true, userStory: true } } },
      },
    },
  })
  if (!sprint) throw new NotFoundError("Sprint not found", {}, "SPRINT_NOT_FOUND")
  const byPbi = new Map<string, SprintPbi>()
  for (const it of sprint.items) {
    const pbi = byPbi.get(it.pbItem.id) ?? {
      id: it.pbItem.id,
      displayId: it.pbItem.displayId,
      title: it.pbItem.initiative || it.pbItem.userStory?.slice(0, 80) || pbiKey(it.pbItem.displayId),
      tasks: [],
    }
    if (it.taskName && it.taskName.trim()) pbi.tasks.push({ id: it.id, status: it.status })
    byPbi.set(pbi.id, pbi)
  }
  return { sprint, pbis: [...byPbi.values()] }
}

export interface GitInsightDto extends InsightHint {
  pbItemId: string
  displayId: number
  title: string
  taskCount: number
}

export async function getSprintGitInsights(projectId: string, sprintId: string, now = new Date()): Promise<{ enabled: boolean; hints: GitInsightDto[] }> {
  if (!(await isGitEnabled(projectId))) return { enabled: false, hints: [] }
  const { pbis } = await loadSprintPbis(projectId, sprintId)
  const links = await prisma.gitLink.findMany({
    // A branch marked gone is history, not a sign of work in progress.
    where: { projectId, backlogItemId: { in: pbis.map((p) => p.id) }, kind: { in: ["mr", "branch"] }, goneAt: null },
    select: { backlogItemId: true, kind: true, ref: true, title: true, url: true, state: true, pipeline: true, occurredAt: true },
  })
  const hints = pbis.flatMap((p) =>
    deriveGitHints(
      p.tasks.map((t) => t.status),
      links.filter((l) => l.backlogItemId === p.id),
      now,
    ).map((h) => ({ ...h, pbItemId: p.id, displayId: p.displayId, title: p.title, taskCount: p.tasks.length })),
  )
  return { enabled: true, hints }
}

export type GitTaskAction = "start" | "complete"

/** Applies a suggestion the user accepted; a stale one (nothing to do any more) changes nothing. */
export async function applyGitTaskAction(projectId: string, sprintId: string, pbItemId: string, action: GitTaskAction, actor: Actor): Promise<{ updated: number }> {
  const { hints } = await getSprintGitInsights(projectId, sprintId)
  if (!hints.some((h) => h.pbItemId === pbItemId && h.action === action)) return { updated: 0 }
  const { pbis } = await loadSprintPbis(projectId, sprintId)
  const pbi = pbis.find((p) => p.id === pbItemId)
  const to = action === "start" ? "in_progress" : "done"
  const targets = (pbi?.tasks ?? []).filter((t) => (action === "start" ? t.status === "todo" : t.status !== "done"))
  for (const t of targets) await updateTask(projectId, sprintId, t.id, { status: to }, actor)
  return { updated: targets.length }
}

/** Recent activity of the sprint's PBIs, ready to paste into the Daily Scrum note. */
export async function getDailyScrumGitDraft(projectId: string, sprintId: string, lang: ReportLang, now = new Date()): Promise<{ enabled: boolean; text: string }> {
  if (!(await isGitEnabled(projectId))) return { enabled: false, text: "" }
  const { pbis } = await loadSprintPbis(projectId, sprintId)
  const hours = draftWindowHours(now)
  const since = new Date(now.getTime() - hours * 3_600_000)
  const links = await prisma.gitLink.findMany({
    where: { projectId, backlogItemId: { in: pbis.map((p) => p.id) }, occurredAt: { gte: since } },
    select: { backlogItemId: true, kind: true, ref: true, title: true, state: true, author: true },
    orderBy: { occurredAt: "asc" },
  })
  const activity: ActivityPbi[] = pbis.map((p) => {
    const mine = links.filter((l) => l.backlogItemId === p.id)
    const mrs = mine.filter((l) => l.kind === "mr")
    const brief = (l: (typeof mrs)[number]) => ({ ref: l.ref, title: l.title, author: l.author })
    return {
      displayId: p.displayId,
      title: p.title,
      merged: mrs.filter((l) => l.state === "merged").map(brief),
      opened: mrs.filter((l) => l.state === "opened" || l.state === "locked").map(brief),
      commits: mine.filter((l) => l.kind === "commit").length,
    }
  })
  return { enabled: true, text: formatDailyScrumDraft(activity, hours, lang) }
}

/** Release note: the merge requests merged during the sprint, per PBI. */
export async function getSprintReleaseNote(projectId: string, sprintId: string, lang: ReportLang): Promise<{ enabled: boolean; text: string; mergedCount: number }> {
  if (!(await isGitEnabled(projectId))) return { enabled: false, text: "", mergedCount: 0 }
  const { sprint, pbis } = await loadSprintPbis(projectId, sprintId)
  const links = await prisma.gitLink.findMany({
    where: {
      projectId,
      kind: "mr",
      state: "merged",
      // Declared-only links (dev:write) are display, never delivery evidence.
      declaredAt: null,
      backlogItemId: { in: pbis.map((p) => p.id) },
      mergedAt: { gte: sprint.startDate, lt: new Date(sprint.endDate.getTime() + DAY_MS) },
    },
    select: { backlogItemId: true, ref: true, title: true, url: true, author: true },
    orderBy: { mergedAt: "asc" },
  })
  const release = pbis.map((p) => ({
    displayId: p.displayId,
    title: p.title,
    mrs: links.filter((l) => l.backlogItemId === p.id).map((l) => ({ ref: l.ref, title: l.title, url: l.url, author: l.author })),
  }))
  const day = (d: Date) => d.toISOString().slice(0, 10)
  const text = formatReleaseNote({ name: sprint.sprintName, from: day(sprint.startDate), to: day(sprint.endDate) }, release, lang)
  return { enabled: true, text, mergedCount: release.reduce((n, p) => n + p.mrs.length, 0) }
}
