import { defaultDb, type Db } from "@/services/_shared/db"
import { StatusError } from "@/services/_shared/errors"

/**
 * Per-project attachment storage quota (project files + icebox, team chat,
 * PBI reference attachments, 改善成果ボード photos and the
 * マイルストーン・検収ボード's 残課題 photos / 引き渡し資料 files).
 * env ATTACHMENT_PROJECT_QUOTA_MB, default 5120; 0 = unlimited.
 *
 * Checked against the declared size before an upload is written. Two
 * concurrent uploads may both pass and overshoot by at most one file, and
 * Collabora saves (WOPI PutFile) are not counted up front: the quota is a
 * guard against runaway growth, not an exact accounting.
 */

export const DEFAULT_PROJECT_QUOTA_MB = 5120

const BYTES_PER_MB = 1024 * 1024

type Env = Readonly<Record<string, string | undefined>>

/** Quota in bytes, or null when unlimited. Invalid values fall back to the default. */
export function projectQuotaBytes(env: Env = process.env): number | null {
  const raw = env.ATTACHMENT_PROJECT_QUOTA_MB?.trim()
  const mb = raw ? Number(raw) : NaN
  if (mb === 0) return null
  const valid = Number.isFinite(mb) && mb > 0
  return (valid ? mb : DEFAULT_PROJECT_QUOTA_MB) * BYTES_PER_MB
}

/**
 * Bytes currently stored for the project. Raw SQL with the sum cast to text:
 * the total can exceed the INT range of `fileSize` (2 GiB), which a Prisma
 * `_sum` on an Int column would have to represent as Int.
 */
export async function projectStorageUsed(db: Db, projectId: string): Promise<number> {
  const rows = await db.$queryRaw<Array<{ total: unknown }>>`
    SELECT CAST(
      (SELECT COALESCE(SUM(pa.fileSize), 0) FROM ProjectAttachment pa WHERE pa.projectId = ${projectId})
      + (SELECT COALESCE(SUM(ia.fileSize), 0)
           FROM IceboxAttachment ia
           JOIN IceboxItem ii ON ii.id = ia.iceboxItemId
          WHERE ii.projectId = ${projectId})
      + (SELECT COALESCE(SUM(ta.fileSize), 0)
           FROM TeamMessageAttachment ta
           JOIN TeamMessage tm ON tm.id = ta.messageId
          WHERE tm.projectId = ${projectId})
      + (SELECT COALESCE(SUM(pa2.fileSize), 0)
           FROM pbi_attachment pa2
           JOIN ProductBacklogItem pbi ON pbi.id = pa2.backlogItemId
          WHERE pbi.projectId = ${projectId})
      + (SELECT COALESCE(SUM(ip.fileSize), 0)
           FROM improvement_photo ip
           JOIN ReleaseBacklogItem rbi ON rbi.id = ip.releaseItemId
          WHERE rbi.projectId = ${projectId})
      + (SELECT COALESCE(SUM(pp.fileSize), 0)
           FROM punch_photo pp
           JOIN punch_item pi ON pi.id = pp.punchItemId
          WHERE pi.projectId = ${projectId})
      + (SELECT COALESCE(SUM(hf.fileSize), 0)
           FROM handover_file hf
           JOIN handover_document hd ON hd.id = hf.documentId
          WHERE hd.projectId = ${projectId})
    AS CHAR) AS total`
  const total = Number(rows[0]?.total ?? 0)
  return Number.isFinite(total) ? total : 0
}

/** 413 STORAGE_QUOTA_EXCEEDED when adding `incomingBytes` would pass the project quota. */
export async function assertStorageQuota(
  projectId: string,
  incomingBytes: number,
  env: Env = process.env,
  db: Db = defaultDb
): Promise<void> {
  const quota = projectQuotaBytes(env)
  if (quota === null) return
  const used = await projectStorageUsed(db, projectId)
  if (used + incomingBytes > quota) {
    throw new StatusError(413, "プロジェクトの添付ファイル容量の上限に達しました", { quotaBytes: quota, usedBytes: used }, "STORAGE_QUOTA_EXCEEDED")
  }
}
