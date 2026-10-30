/**
 * Stored sync messages the UI shows in the viewer's language (client-safe, no
 * server imports). The server stores the Japanese text in
 * git_repository.lastError; `syncMessageKey` maps it back to an i18n key.
 */

/** The stored position of a repository cannot be read (InvalidCursorError): 過去分を再同期 resets it. */
export const CURSOR_INVALID_MESSAGE = "同期位置の記録を読み取れません。リポジトリの「過去分を再同期」でやり直してください。"

export type SyncMessageKey = "gitSyncCursorInvalid"

const KEYS: ReadonlyMap<string, SyncMessageKey> = new Map([[CURSOR_INVALID_MESSAGE, "gitSyncCursorInvalid"]])

/** i18n key of a stored lastError the UI translates, or null (shown as stored). */
export function syncMessageKey(lastError: string | null | undefined): SyncMessageKey | null {
  return lastError ? (KEYS.get(lastError) ?? null) : null
}
