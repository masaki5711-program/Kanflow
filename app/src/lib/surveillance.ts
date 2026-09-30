import { prisma } from "@/lib/prisma"
import { LIVE_PBI } from "@/services/_shared/soft-delete"
import { DEFAULT_SURVEILLANCE_SETTINGS, type SurveillanceSettings } from "@/lib/surveillance-settings"

/**
 * Deterministic anomaly detection for the AI surveillance job.
 *
 * Pure code — no LLM involved. These checks decide WHETHER the autonomous
 * agent investigation is worth launching; the agent then explains WHY and
 * WHAT TO DO. Mirrors the IoT pattern: threshold check (cheap, always-on)
 * → AI investigation (expensive, on demand).
 *
 * Thresholds come from the project's surveillance settings
 * (lib/surveillance-settings.ts); the defaults equal the constants this file
 * used to hard-code.
 */

export interface Anomaly {
  code: string
  severity: "warning" | "critical"
  description: string
}

const DAY_MS = 86_400_000

const isRealTask = (t: { taskName: string | null }) => (t.taskName ?? "").trim().length > 0

type OpenSprint = Awaited<ReturnType<typeof loadOpenSprints>>[number]

function loadOpenSprints(projectId: string) {
  return prisma.sprint.findMany({
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
}

/** 1) Sprint end date (+ grace) passed but still open with unfinished tasks. */
function checkOverdue(s: OpenSprint, cfg: SurveillanceSettings, now: number): Anomaly | null {
  const open = s.items.filter(isRealTask).filter((t) => t.status !== "done")
  const overdueMs = now - new Date(s.endDate).getTime()
  if (overdueMs <= cfg.sprintOverdueGraceDays * DAY_MS || open.length === 0) return null
  const overdueDays = Math.floor(overdueMs / DAY_MS)
  return {
    code: "sprint_overdue",
    severity: "critical",
    description: `スプリント「${s.sprintName}」は終了日を${overdueDays}日超過、未完了タスク${open.length}件が残っている`,
  }
}

/** 2) Stalled in-progress tasks. */
function checkStalled(s: OpenSprint, cfg: SurveillanceSettings, now: number): Anomaly | null {
  const cutoff = now - cfg.stalledDays * DAY_MS
  const stalled = s.items.filter(isRealTask).filter((t) => t.status === "in_progress" && new Date(t.updatedAt).getTime() < cutoff)
  if (stalled.length < cfg.stalledTasksThreshold) return null
  return {
    code: "stalled_tasks",
    severity: "warning",
    description: `スプリント「${s.sprintName}」で${cfg.stalledDays}日以上更新のない進行中タスクが${stalled.length}件`,
  }
}

/** 3) Active sprint with no recent daily scrum note. */
function checkDailyScrum(s: OpenSprint, cfg: SurveillanceSettings, now: number): Anomaly | null {
  if (!cfg.checkDailyScrum || s.status !== "active") return null
  const last = s.dailyScrumNotes[0]?.date
  const silentDays = last ? Math.floor((now - new Date(last).getTime()) / DAY_MS) : null
  if (silentDays !== null && silentDays < cfg.dailyScrumSilentDays) return null
  return {
    code: "daily_scrum_silent",
    severity: "warning",
    description: last
      ? `アクティブスプリント「${s.sprintName}」のデイリースクラム記録が${silentDays}日途絶えている`
      : `アクティブスプリント「${s.sprintName}」にデイリースクラム記録が一件もない`,
  }
}

/** 4) Committed story points over capacity (+ tolerance), unique PBIs. */
async function checkCapacity(s: OpenSprint, cfg: SurveillanceSettings): Promise<Anomaly | null> {
  if (s.capacity <= 0) return null
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
  const limit = s.capacity * (1 + cfg.overCapacityTolerancePct / 100)
  if (committed <= limit) return null
  return {
    code: "over_capacity",
    severity: "warning",
    description: `スプリント「${s.sprintName}」の投入${committed}ptがキャパシティ${s.capacity}ptを超過`,
  }
}

export async function detectAnomalies(
  projectId: string,
  settings: SurveillanceSettings = DEFAULT_SURVEILLANCE_SETTINGS
): Promise<Anomaly[]> {
  const now = Date.now()
  const openSprints = await loadOpenSprints(projectId)
  const anomalies: Anomaly[] = []
  for (const s of openSprints) {
    for (const found of [checkOverdue(s, settings, now), checkStalled(s, settings, now), checkDailyScrum(s, settings, now)]) {
      if (found) anomalies.push(found)
    }
  }
  for (const s of openSprints) {
    const found = await checkCapacity(s, settings)
    if (found) anomalies.push(found)
  }
  return anomalies
}
