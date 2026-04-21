import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireProjectMember } from "@/lib/api-helpers"

interface SprintMarker {
  id: string
  name: string
  status: string
  startIndex: number
  endIndex: number
  taskCount: number
  doneCount: number
}

interface BurndownData {
  days: string[]
  totalTasks: number
  idealLine: number[]
  planLine: number[]
  actualLine: (number | null)[]
  actualBaseline: number | null
  sprintMarkers: SprintMarker[]
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const result = await requireProjectMember(projectId)
  if ("error" in result) return result.error

  const sprints = await prisma.sprint.findMany({
    where: { projectId, status: { in: ["planning", "active", "review", "done"] } },
    include: { items: true },
    orderBy: { startDate: "asc" },
  })

  if (sprints.length === 0) {
    const empty: BurndownData = {
      days: [],
      totalTasks: 0,
      idealLine: [],
      planLine: [],
      actualLine: [],
      actualBaseline: null,
      sprintMarkers: [],
    }
    return NextResponse.json(empty)
  }

  const earliestStart = startOfDay(
    sprints.reduce<Date>((min, s) => (s.startDate < min ? s.startDate : min), sprints[0].startDate)
  )
  const latestEnd = startOfDay(
    sprints.reduce<Date>((max, s) => (s.endDate > max ? s.endDate : max), sprints[0].endDate)
  )
  const today = startOfDay(new Date())
  const rangeEnd = today > latestEnd ? today : latestEnd

  const days: string[] = []
  for (
    let d = new Date(earliestStart);
    d.getTime() <= rangeEnd.getTime();
    d = addDays(d, 1)
  ) {
    days.push(toDateKey(d))
  }

  const dayIndex = new Map<string, number>()
  days.forEach((k, i) => dayIndex.set(k, i))

  const totalTasks = sprints.reduce((sum, s) => sum + s.items.length, 0)
  const idealLine = days.map((_, i) =>
    days.length <= 1 ? 0 : totalTasks - (totalTasks * i) / (days.length - 1)
  )

  const planLine: number[] = new Array(days.length).fill(totalTasks)
  let remaining = totalTasks
  for (const sprint of sprints) {
    const startIdx = dayIndex.get(toDateKey(startOfDay(sprint.startDate))) ?? 0
    const endIdx = dayIndex.get(toDateKey(startOfDay(sprint.endDate))) ?? days.length - 1
    const sprintTaskCount = sprint.items.length
    const perDay = endIdx > startIdx ? sprintTaskCount / (endIdx - startIdx) : sprintTaskCount
    for (let i = 0; i < days.length; i++) {
      if (i < startIdx) {
        planLine[i] = remaining
      } else if (i >= startIdx && i <= endIdx) {
        planLine[i] = Math.max(0, remaining - perDay * (i - startIdx))
      }
    }
    remaining -= sprintTaskCount
    for (let i = endIdx + 1; i < days.length; i++) {
      planLine[i] = Math.max(0, remaining)
    }
  }

  const actualLine: (number | null)[] = new Array(days.length).fill(null)
  const doneEvents = new Map<string, number>()
  for (const sprint of sprints) {
    for (const item of sprint.items) {
      if (item.status === "done" && item.completedAt) {
        const k = toDateKey(startOfDay(item.completedAt))
        doneEvents.set(k, (doneEvents.get(k) ?? 0) + 1)
      }
    }
  }

  let rem = totalTasks
  let actualBaseline: number | null = null
  const todayKey = toDateKey(today)
  for (let i = 0; i < days.length; i++) {
    const k = days[i]
    const done = doneEvents.get(k) ?? 0
    if (done > 0) {
      if (actualBaseline === null) {
        actualBaseline = rem
      }
      rem -= done
      actualLine[i] = rem
    } else if (actualBaseline !== null) {
      actualLine[i] = rem
    }
    if (k === todayKey && actualBaseline !== null && actualLine[i] === null) {
      actualLine[i] = rem
    }
  }

  const sprintMarkers: SprintMarker[] = sprints.map((s) => ({
    id: s.id,
    name: s.sprintName,
    status: s.status,
    startIndex: dayIndex.get(toDateKey(startOfDay(s.startDate))) ?? 0,
    endIndex: dayIndex.get(toDateKey(startOfDay(s.endDate))) ?? days.length - 1,
    taskCount: s.items.length,
    doneCount: s.items.filter((i) => i.status === "done").length,
  }))

  const payload: BurndownData = {
    days,
    totalTasks,
    idealLine,
    planLine,
    actualLine,
    actualBaseline,
    sprintMarkers,
  }
  return NextResponse.json(payload)
}
