/**
 * Velocity: completed points (Sprint.actualScore — the workload of PBIs whose
 * real tasks are all done, see lib/sprint-score.ts) of the last N finished
 * sprints, oldest → newest, plus their average.
 */
import { defaultDb, type Db } from "@/services/_shared/db"
import { getI18nFor } from "@/services/_shared/translations"
import type { EntityI18n } from "@/lib/translation/types"

/** Sprints whose points are final (review / done / archived). */
export const VELOCITY_STATUSES = ["review", "done", "archived"] as const
export const VELOCITY_WINDOW = 8

export interface VelocitySprintRow {
  id: string
  sprintName: string
  status: string
  capacity: number | null
  actualScore: number | null
  startDate: Date
  endDate: Date
}

export interface VelocityPoint {
  id: string
  name: string
  status: string
  points: number
  capacity: number
  endDate: string
  /** Translations of the sprint name (the client picks the viewer's language). */
  i18n?: EntityI18n
}

export interface VelocitySeries {
  sprints: VelocityPoint[]
  /** Mean completed points (1 decimal), null without finished sprints. */
  average: number | null
}

export interface VelocityData extends VelocitySeries {
  pointUnit: string
}

const nonNegative = (value: number | null | undefined) => Math.max(0, value ?? 0)

/** Pure: newest `window` sprints by end date, returned oldest → newest, with the average. */
export function computeVelocity(rows: readonly VelocitySprintRow[], window: number = VELOCITY_WINDOW): VelocitySeries {
  const newestFirst = [...rows].sort((a, b) => b.endDate.getTime() - a.endDate.getTime()).slice(0, window)
  const sprints = newestFirst.reverse().map((r) => ({
    id: r.id,
    name: r.sprintName,
    status: r.status,
    points: nonNegative(r.actualScore),
    capacity: nonNegative(r.capacity),
    endDate: r.endDate.toISOString(),
  }))
  if (sprints.length === 0) return { sprints, average: null }
  const mean = sprints.reduce((sum, s) => sum + s.points, 0) / sprints.length
  return { sprints, average: Math.round(mean * 10) / 10 }
}

export function findVelocitySprints(db: Db, projectId: string, take: number) {
  return db.sprint.findMany({
    where: { projectId, status: { in: [...VELOCITY_STATUSES] } },
    select: { id: true, sprintName: true, status: true, capacity: true, actualScore: true, startDate: true, endDate: true },
    orderBy: [{ endDate: "desc" }, { createdAt: "desc" }],
    take,
  })
}

export async function getVelocity(projectId: string, window: number = VELOCITY_WINDOW): Promise<VelocityData> {
  const [rows, project] = await Promise.all([
    findVelocitySprints(defaultDb, projectId, window),
    defaultDb.project.findUnique({ where: { id: projectId }, select: { pointUnit: true } }),
  ])
  const series = computeVelocity(rows, window)
  if (series.sprints.length === 0) return { ...series, pointUnit: project?.pointUnit ?? "SP" }
  const i18n = await getI18nFor("sprint", series.sprints.map((s) => s.id))
  const sprints = series.sprints.map((s) => ({ ...s, i18n: i18n.get(s.id) ?? {} }))
  return { ...series, sprints, pointUnit: project?.pointUnit ?? "SP" }
}
