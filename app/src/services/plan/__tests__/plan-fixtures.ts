/** Shared plan-row fixtures for plan tests (not a test file itself). */

export const day = (key: string): Date => new Date(`${key}T00:00:00.000Z`)

export interface PlanRowFixture {
  id: string
  projectId: string
  parentId: string | null
  name: string
  description: string | null
  notes: string | null
  plannedStart: Date | null
  plannedEnd: Date | null
  durationDays: number | null
  templateApplicationId: string | null
  actualStart: Date | null
  actualEnd: Date | null
  baselineStart: Date | null
  baselineEnd: Date | null
  progressPct: number
  progressMode: string
  status: string
  isMilestone: boolean
  color: string | null
  sortOrder: number
  version: number
  ownerId: string | null
  owner: { id: string; name: string } | null
  deletedAt: Date | null
  deletedById: string | null
  createdAt: Date
  updatedAt: Date
}

/** A live plan row (with owner include) as the repository returns it. */
export function planRow(over: Partial<PlanRowFixture> = {}): PlanRowFixture {
  return {
    id: "i1",
    projectId: "p1",
    parentId: null,
    name: "Item",
    description: null,
    notes: null,
    plannedStart: day("2026-10-01"),
    plannedEnd: day("2026-10-10"),
    durationDays: null,
    templateApplicationId: null,
    actualStart: null,
    actualEnd: null,
    baselineStart: null,
    baselineEnd: null,
    progressPct: 0,
    progressMode: "manual",
    status: "not_started",
    isMilestone: false,
    color: null,
    sortOrder: 1,
    version: 0,
    ownerId: null,
    owner: null,
    deletedAt: null,
    deletedById: null,
    createdAt: day("2026-09-01"),
    updatedAt: day("2026-09-01"),
    ...over,
  }
}
