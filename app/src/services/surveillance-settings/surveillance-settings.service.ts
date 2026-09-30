import { defaultDb, withTransaction, type Db } from "@/services/_shared/db"
import { NotFoundError } from "@/services/_shared/errors"
import type { Actor } from "@/services/_shared/actor"
import { logActivity, type ActivityChanges } from "@/services/_shared/activity"
import {
  parseStoredSurveillanceSettings,
  serializeSurveillanceSettings,
  type SurveillanceSettings,
} from "@/lib/surveillance-settings"

/**
 * Per-project AI surveillance thresholds (Project.surveillanceSettings).
 * Reads always return a complete object (defaults for missing fields); the
 * PUT stores the full validated object. The worker reads the column itself
 * (worker/jobs/surveillance.ts) so a save applies to the next scheduled run.
 */

async function loadStored(db: Db, projectId: string): Promise<string | null> {
  const row = await db.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { surveillanceSettings: true },
  })
  if (!row) throw new NotFoundError("Project not found")
  return row.surveillanceSettings
}

export async function getSurveillanceSettings(projectId: string): Promise<SurveillanceSettings> {
  return parseStoredSurveillanceSettings(await loadStored(defaultDb, projectId))
}

/** Field-level diff for the activity log (only changed keys). */
export function settingsChanges(before: SurveillanceSettings, after: SurveillanceSettings): ActivityChanges {
  const changes: ActivityChanges = {}
  for (const key of Object.keys(after) as (keyof SurveillanceSettings)[]) {
    if (before[key] !== after[key]) changes[`surveillance.${key}`] = { from: before[key], to: after[key] }
  }
  return changes
}

export async function updateSurveillanceSettings(
  projectId: string,
  input: SurveillanceSettings,
  actor: Actor
): Promise<SurveillanceSettings> {
  return withTransaction(async (tx) => {
    const before = parseStoredSurveillanceSettings(await loadStored(tx, projectId))
    const next: SurveillanceSettings = { ...input }
    await tx.project.update({
      where: { id: projectId },
      data: { surveillanceSettings: serializeSurveillanceSettings(next) },
      select: { id: true },
    })
    const changes = settingsChanges(before, next)
    if (Object.keys(changes).length > 0) {
      await logActivity(tx, { projectId, entityType: "project", entityId: projectId, action: "update", actor, diff: { changes } })
    }
    return next
  })
}
