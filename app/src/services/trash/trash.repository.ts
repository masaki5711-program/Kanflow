import type { Db } from "@/services/_shared/db"

/** id → display name of the given users (unknown / deleted users are absent). */
export async function findUserNames(db: Db, userIds: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(userIds)]
  if (unique.length === 0) return new Map()
  const rows = await db.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } })
  return new Map(rows.map((u) => [u.id, u.name]))
}
