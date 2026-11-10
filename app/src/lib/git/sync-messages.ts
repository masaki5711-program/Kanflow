/**
 * Stored sync messages the UI shows in the viewer's language (client-safe, no
 * server imports). The server stores the Japanese text in
 * git_repository.lastError; `syncMessageKey` maps it back to an i18n key.
 */

/** The stored position of a repository cannot be read (InvalidCursorError): 過去分を再同期 resets it. */
export const CURSOR_INVALID_MESSAGE = "同期位置の記録を読み取れません。リポジトリの「過去分を再同期」でやり直してください。"


/** GitStation (K3; the state re-read reads the development status since I1d, so the bound is no longer one number). */
export const STATION_TRUNCATED_MESSAGE = "GitStation の状態の取り直しが、1 回に読める上限を超えました。管理者に連絡してください。"
/** The K3 wording, still stored on rows written before (shown translated like the new one). */
const STATION_TRUNCATED_MESSAGE_K3 = "GitStation の状態の取り直しが上限（マージリクエスト 2000 件）を超えました。管理者に連絡してください。"

/** GitStation (K3). */
export const STATION_HOST_NOT_ALLOWED_MESSAGE = "GitStation のホストが許可されていません（GITSTATION_ALLOWED_HOSTS）。管理者に連絡してください。"

/** GitStation (K3). */
export const STATION_NOT_BOUND_MESSAGE = "このリポジトリは GitStation でこのプロジェクトだけに結び付けられていません。GitStation の管理者に、このプロジェクトへの結び付けを依頼してください（結び付けが戻ると状態を取り直します）。"

/** GitStation (K3). */
export const STATION_HELD_MESSAGE = "リポジトリを確かめられない・書き込めないものがあったため、イベントの履歴の位置を進めていません。次回の同期でやり直します。"

/** GitStation (K3). */
export const STATION_QUARANTINED_MESSAGE = "このリポジトリは 3 回続けて書き込めなかったため、いったん外しました（他のリポジトリは進みます）。状態は後で取り直します。"

export type SyncMessageKey = "gitSyncCursorInvalid" | "gitSyncStationTruncated" | "gitSyncStationHostNotAllowed" | "gitSyncStationNotBound" | "gitSyncStationHeld" | "gitSyncStationQuarantined"

const KEYS: ReadonlyMap<string, SyncMessageKey> = new Map<string, SyncMessageKey>([
  [CURSOR_INVALID_MESSAGE, "gitSyncCursorInvalid"],
  [STATION_TRUNCATED_MESSAGE, "gitSyncStationTruncated"],
  [STATION_TRUNCATED_MESSAGE_K3, "gitSyncStationTruncated"],
  [STATION_HOST_NOT_ALLOWED_MESSAGE, "gitSyncStationHostNotAllowed"],
  [STATION_NOT_BOUND_MESSAGE, "gitSyncStationNotBound"],
  [STATION_HELD_MESSAGE, "gitSyncStationHeld"],
  [STATION_QUARANTINED_MESSAGE, "gitSyncStationQuarantined"],
])

/** i18n key of a stored lastError the UI translates, or null (shown as stored). */
export function syncMessageKey(lastError: string | null | undefined): SyncMessageKey | null {
  return lastError ? (KEYS.get(lastError) ?? null) : null
}
