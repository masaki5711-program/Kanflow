import type { Prisma } from "@/generated/prisma/client"
import type { Db } from "@/services/_shared/db"
import { LIST_LIMITS } from "@/services/_shared/limits"

export function findLatestReports(db: Db, projectId: string) {
  return db.aiReport.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take: LIST_LIMITS.aiReports,
    select: {
      id: true,
      trigger: true,
      status: true,
      title: true,
      summary: true,
      body: true,
      structured: true,
      createdAt: true,
    },
  })
}

export function insertReport(db: Db, data: Prisma.AiReportUncheckedCreateInput) {
  return db.aiReport.create({ data, select: { id: true } })
}

/** Delete the project's other reports of `trigger` (keep only `keepId`). */
export function deleteOtherReports(db: Db, projectId: string, trigger: string, keepId: string) {
  return db.aiReport.deleteMany({ where: { projectId, trigger, id: { not: keepId } } })
}
