/**
 * Team chat limits shared by the API (enforced) and the composer (checked
 * before upload so the user gets the reason immediately).
 */
export const TEAM_CHAT_BODY_MAX = 10_000
/** Files per message. */
export const TEAM_CHAT_MAX_FILES = 5
/** Bytes per file (20 MB): larger files are refused — share them as a link instead. */
export const TEAM_CHAT_MAX_FILE_BYTES = 20 * 1024 * 1024
/** Bytes per message, all files together (50 MB). */
export const TEAM_CHAT_MAX_TOTAL_BYTES = 50 * 1024 * 1024

export type FileRejection = { reason: "too_many" } | { reason: "too_large"; name: string } | { reason: "total_too_large" }

/** Pure: why this set of files cannot be sent (null = fine). */
export function checkTeamChatFiles(files: readonly { name: string; size: number }[]): FileRejection | null {
  if (files.length > TEAM_CHAT_MAX_FILES) return { reason: "too_many" }
  const big = files.find((f) => f.size > TEAM_CHAT_MAX_FILE_BYTES)
  if (big) return { reason: "too_large", name: big.name }
  if (files.reduce((sum, f) => sum + f.size, 0) > TEAM_CHAT_MAX_TOTAL_BYTES) return { reason: "total_too_large" }
  return null
}
