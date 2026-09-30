import type { Prisma } from "@/generated/prisma/client"
import { defaultDb, withTransaction } from "@/services/_shared/db"
import * as repo from "./ai-reports.repository"

/** Newest reports for the project dashboard (fixed small page). */
export function listLatestReports(projectId: string) {
  return repo.findLatestReports(defaultDb, projectId)
}

/**
 * Store a report and drop the project's previous reports of the same
 * trigger, atomically. Returns the new id and how many were superseded.
 */
export async function saveReplacingPrevious(
  data: Prisma.AiReportUncheckedCreateInput
): Promise<{ id: string; superseded: number }> {
  return withTransaction(async (tx) => {
    const report = await repo.insertReport(tx, data)
    const { count } = await repo.deleteOtherReports(tx, data.projectId, data.trigger, report.id)
    return { id: report.id, superseded: count }
  })
}
