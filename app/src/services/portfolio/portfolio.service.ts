/**
 * Department portfolio (P4): one row per project the viewer oversees, built
 * from 8 batched queries + 2 translation lookups regardless of the number of
 * projects (capped at PORTFOLIO_PROJECT_CAP).
 */
import { isRealTask } from "@/lib/tool-helpers"
import { defaultDb, type Db } from "@/services/_shared/db"
import { ForbiddenError } from "@/services/_shared/errors"
import { getI18nFor } from "@/services/_shared/translations"
import { daysLeft, needsAttention, planSummary, sprintBurn, velocityTrend, type PlanRow } from "./portfolio.compute"
import * as repo from "./portfolio.repository"
import { canViewPortfolio, portfolioProjectWhere, severityFromMeta, type PortfolioViewer } from "./portfolio.scope"
import type { PortfolioDto, PortfolioRow, PortfolioSection, PortfolioSprint } from "./portfolio.types"

const VELOCITY_POINTS = 3

type OpenSprint = Awaited<ReturnType<typeof repo.findOpenSprints>>[number]
type Project = Awaited<ReturnType<typeof repo.findPortfolioProjects>>[number]

function groupBy<T, K>(rows: readonly T[], key: (r: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>()
  for (const r of rows) out.set(key(r), [...(out.get(key(r)) ?? []), r])
  return out
}

function sectionsOf(p: Project): PortfolioSection[] {
  return p.sections
    .map((s) => s.section)
    .toSorted((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map(({ id, name }) => ({ id, name }))
}

/** Committed points: each PBI of the sprint once. */
function plannedPoints(s: OpenSprint): number {
  const byPbi = new Map(s.items.map((i) => [i.pbItemId, i.pbItem.workloadScore]))
  return [...byPbi.values()].reduce((a, b) => a + b, 0)
}

function toSprint(s: OpenSprint, today: Date, i18n: PortfolioSprint["i18n"]): PortfolioSprint {
  const tasks = s.items.filter(isRealTask)
  const done = tasks.filter((t) => t.status === "done").length
  return {
    id: s.id,
    name: s.sprintName,
    i18n,
    endDate: s.endDate.toISOString(),
    daysLeft: daysLeft(today, s.endDate),
    tasksDone: done,
    tasksTotal: tasks.length,
    progressPct: tasks.length > 0 ? Math.round((done / tasks.length) * 100) : null,
    donePoints: Math.max(0, s.actualScore),
    plannedPoints: plannedPoints(s),
    burn: sprintBurn(tasks, s.startDate, s.endDate, today),
  }
}

/** Unfinished real tasks of this project's open sprints whose end date has passed. */
function overdueTasks(sprints: readonly OpenSprint[], today: Date): number {
  return sprints
    .filter((s) => daysLeft(today, s.endDate) < 0)
    .reduce((n, s) => n + s.items.filter((t) => isRealTask(t) && t.status !== "done").length, 0)
}

interface Loaded {
  sprints: Map<string, OpenSprint[]>
  velocity: Map<string, number[]>
  backlog: Map<string, { count: number; points: number }>
  surveillance: Map<string, { severity: ReturnType<typeof severityFromMeta>; at: string }>
  plan: Map<string, PlanRow[]>
  activity: Map<string, string>
}

async function loadAll(db: Db, ids: readonly string[], now: Date): Promise<Loaded> {
  const [sprints, finished, backlog, reports, plan, activity] = await Promise.all([
    repo.findOpenSprints(db, ids),
    repo.findFinishedSprints(db, ids, now),
    repo.countOpenPbis(db, ids),
    repo.findLatestSurveillance(db, ids),
    repo.findPlanRows(db, ids),
    repo.findLastActivity(db, ids),
  ])
  const velocity = new Map(
    [...groupBy(finished, (s) => s.projectId)].map(([id, rows]) => [id, rows.slice(0, VELOCITY_POINTS).reverse().map((r) => Math.max(0, r.actualScore))])
  )
  return {
    sprints: groupBy(sprints, (s) => s.projectId),
    velocity,
    backlog: new Map(backlog.map((b) => [b.projectId, { count: b._count._all, points: b._sum.workloadScore ?? 0 }])),
    surveillance: new Map(reports.map((r) => [r.projectId, { severity: severityFromMeta(r.meta), at: r.createdAt.toISOString() }])),
    plan: groupBy(plan, (p) => p.projectId),
    activity: new Map(activity.flatMap((a) => (a._max.createdAt ? [[a.projectId, a._max.createdAt.toISOString()] as const] : []))),
  }
}

function toRow(p: Project, data: Loaded, i18n: { project: Map<string, PortfolioRow["i18n"]>; sprint: Map<string, PortfolioRow["i18n"]> }, now: Date): PortfolioRow {
  const own = data.sprints.get(p.id) ?? []
  const active = own.find((s) => s.status === "active") ?? null
  const velocity = data.velocity.get(p.id) ?? []
  const backlog = data.backlog.get(p.id) ?? { count: 0, points: 0 }
  const base = {
    id: p.id,
    name: p.name,
    i18n: i18n.project.get(p.id) ?? {},
    status: p.status,
    sections: sectionsOf(p),
    activeSprint: active ? toSprint(active, now, i18n.sprint.get(active.id) ?? {}) : null,
    overdueTasks: overdueTasks(own, now),
    openPbis: backlog.count,
    openPoints: backlog.points,
    velocity,
    velocityTrend: velocityTrend(velocity),
    surveillance: data.surveillance.get(p.id) ?? null,
    plan: planSummary(data.plan.get(p.id) ?? [], now),
    lastActivityAt: data.activity.get(p.id) ?? null,
  }
  return { ...base, needsAttention: needsAttention(base) }
}

/** Distinct sections of the listed projects, in admin order. */
function sectionList(projects: readonly Project[]): PortfolioSection[] {
  const byId = new Map(projects.flatMap((p) => p.sections.map((s) => [s.section.id, s.section] as const)))
  return [...byId.values()].toSorted((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)).map(({ id, name }) => ({ id, name }))
}

/** 403 unless the viewer is a system admin or a section manager. */
export async function getPortfolio(viewer: PortfolioViewer, now: Date = new Date(), db: Db = defaultDb): Promise<PortfolioDto> {
  if (!canViewPortfolio(viewer)) throw new ForbiddenError("管理者またはセクション管理者のみ閲覧できます", {}, "FORBIDDEN")
  const found = await repo.findPortfolioProjects(db, portfolioProjectWhere(viewer))
  const projects = found.slice(0, repo.PORTFOLIO_PROJECT_CAP)
  const scope = viewer.systemRole === "admin" ? "all" : "sections"
  const base = { asOf: now.toISOString(), scope, capped: found.length > projects.length, sections: sectionList(projects) } as const
  if (projects.length === 0) return { ...base, rows: [] }

  const ids = projects.map((p) => p.id)
  const data = await loadAll(db, ids, now)
  const activeSprintIds = [...data.sprints.values()].flat().filter((s) => s.status === "active").map((s) => s.id)
  const [projectI18n, sprintI18n] = await Promise.all([getI18nFor("project", ids), getI18nFor("sprint", activeSprintIds)])
  const rows = projects.map((p) => toRow(p, data, { project: projectI18n, sprint: sprintI18n }, now))
  return { ...base, rows }
}
