import { prisma } from "@/lib/prisma"
import { LIVE_PBI } from "@/services/_shared/soft-delete"

/**
 * Deterministic anomaly detection for the AI surveillance job.
 *
 * Pure code — no LLM involved. These checks decide WHETHER the autonomous
 * agent investigation is worth launching; the agent then explains WHY and
 * WHAT TO DO. Mirrors the IoT pattern: threshold check (cheap, always-on)
 * → AI investigation (expensive, on demand).
 */

export interface Anomaly {
  code: string
  severity: "warning" | "critical"
  description: string
}

const STALLED_DAYS = 3
const STALLED_TASKS_THRESHOLD = 3
const NO_DAILY_SCRUM_DAYS = 3

const isRealTask = (t: { taskName: string | null }) => (t.taskName ?? "").trim().length > 0

export async function detectAnomalies(projectId: string): Promise<Anomaly[]> {
  const anomalies: Anomaly[] = []
  const now = Date.now()

  const openSprints = await prisma.sprint.findMany({
    where: { projectId, status: { in: ["planning", "active"] } },
    include: {
      items: {
        where: LIVE_PBI,
        select: { taskName: true, status: true, updatedAt: true },
      },
      dailyScrumNotes: {
        where: { archivedAt: null },
        orderBy: { date: "desc" },
        take: 1,
        select: { date: true },
      },
    },
  })

  for (const s of openSprints) {
    const real = s.items.filter(isRealTask)
    const open = real.filter((t) => t.status !== "done")

    // 1) Sprint end date passed but still open with unfinished tasks
    if (new Date(s.endDate).getTime() < now && open.length > 0) {
      const overdueDays = Math.floor((now - new Date(s.endDate).getTime()) / 86_400_000)
      anomalies.push({
        code: "sprint_overdue",
        severity: "critical",
        description: `スプリント「${s.sprintName}」は終了日を${overdueDays}日超過、未完了タスク${open.length}件が残っている`,
      })
    }

    // 2) Stalled in-progress tasks
    const cutoff = now - STALLED_DAYS * 86_400_000
    const stalled = real.filter(
      (t) => t.status === "in_progress" && new Date(t.updatedAt).getTime() < cutoff
    )
    if (stalled.length >= STALLED_TASKS_THRESHOLD) {
      anomalies.push({
        code: "stalled_tasks",
        severity: "warning",
        description: `スプリント「${s.sprintName}」で${STALLED_DAYS}日以上更新のない進行中タスクが${stalled.length}件`,
      })
    }

    // 3) Active sprint with no recent daily scrum note
    if (s.status === "active") {
      const last = s.dailyScrumNotes[0]?.date
      const silentDays = last
        ? Math.floor((now - new Date(last).getTime()) / 86_400_000)
        : null
      if (silentDays === null || silentDays >= NO_DAILY_SCRUM_DAYS) {
        anomalies.push({
          code: "daily_scrum_silent",
          severity: "warning",
          description: last
            ? `アクティブスプリント「${s.sprintName}」のデイリースクラム記録が${silentDays}日途絶えている`
            : `アクティブスプリント「${s.sprintName}」にデイリースクラム記録が一件もない`,
        })
      }
    }
  }

  // 4) Committed story points over capacity (per open sprint, unique PBIs)
  for (const s of openSprints) {
    if (s.capacity <= 0) continue
    const uniquePb = await prisma.sprintBacklogItem.findMany({
      where: { sprintId: s.id, ...LIVE_PBI },
      select: { pbItem: { select: { id: true, workloadScore: true } } },
    })
    const seen = new Set<string>()
    let committed = 0
    for (const it of uniquePb) {
      if (seen.has(it.pbItem.id)) continue
      seen.add(it.pbItem.id)
      committed += it.pbItem.workloadScore
    }
    if (committed > s.capacity) {
      anomalies.push({
        code: "over_capacity",
        severity: "warning",
        description: `スプリント「${s.sprintName}」の投入${committed}ptがキャパシティ${s.capacity}ptを超過`,
      })
    }
  }

  return anomalies
}
