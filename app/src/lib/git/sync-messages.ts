/**
 * Stored sync messages the UI shows in the viewer's language (client-safe, no
 * server imports). The server stores the Japanese text in
 * git_repository.lastError (and git_acceptance_report.lastError);
 * `syncMessageText` gives it back in the viewer's language.
 *
 * Every text GitStation's side of the sync can store is defined here, so none
 * of them reaches an English or Indonesian reader untranslated
 * (gitstation-source.test.ts checks the whole list). A text is never reworded
 * in place: rows written before would stop matching — add the new wording and
 * keep the old one in KEYS (see STATION_TRUNCATED_MESSAGE_K3).
 */

/** The cause is not one the user can act on (an internal error; the server log has it). */
export const SYNC_FAILED_MESSAGE = "同期中にエラーが発生しました"

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

/** GitStation: the project has no integration id. */
export const STATION_MISSING_INTEGRATION_MESSAGE = "GitStation の連携 ID が設定されていません。チーム設定の Git 連携で入れてください。"

/** GitStation answered 401. */
export const STATION_AUTH_MESSAGE = "GitStation がトークンを拒否しました（無効または期限切れ）。連携のサービスアカウントの新しいトークンを設定してください。"

/** GitStation answered 403 to a read. */
export const STATION_FORBIDDEN_MESSAGE = "連携のサービスアカウントに、このリポジトリを読む権限がありません。GitStation で連携にリポジトリを結び付けてください。"

/** GitStation answered 404 to a read. */
export const STATION_NOT_FOUND_MESSAGE = "リポジトリか連携が GitStation に見つからないか、この連携からは見えません。URL と連携 ID を確認してください。"

/** GitStation answered 410: the event history position is gone. */
export const STATION_GONE_MESSAGE = "GitStation のイベントの履歴の位置が無効になりました。状態を取り直します（次回の同期）。"

/** GitStation answered 429. */
export const STATION_RATE_LIMITED_MESSAGE = "GitStation の利用制限に達しました。次回の同期で再試行します。"

/** GitStation answered 503. */
export const STATION_UNAVAILABLE_MESSAGE = "GitStation が一時的に利用できません。次回の同期で再試行します。"

/** GitStation could not be reached. */
export const STATION_NETWORK_MESSAGE = "GitStation に接続できませんでした。次回の同期で再試行します。"

/** GitStation answered in a shape Kanflow does not understand. */
export const STATION_INVALID_RESPONSE_MESSAGE = "GitStation から想定外の応答がありました。次回の同期で再試行します（続く場合は管理者に連絡してください）。"

/** GitStation answered with a status that has no text of its own (the status is part of the stored text). */
export function stationHttpMessage(status: number | undefined): string {
  return `GitStation がエラーを返しました（${status ?? "?"}）。次回の同期で再試行します。`
}
const STATION_HTTP_MESSAGE = /^GitStation がエラーを返しました（(\d{1,3}|\?)）。次回の同期で再試行します。$/

/** GitStation acceptance check (git_acceptance_report.lastError): GitStation refused the report (403). */
export const ACCEPTANCE_REPORT_REFUSED_MESSAGE =
  "GitStation がチェックの報告を拒否しました。GitStation の管理者に、連携のサービスアカウントへこのリポジトリの kanflow チェックを報告する許可（check-grants）と、Developer 以上の権限を依頼してください。"

/** GitStation acceptance check: the head commit read a moment ago is not in the repository (404 on the report). */
export const ACCEPTANCE_COMMIT_MISSING_MESSAGE = "チェックの報告先のコミットが GitStation に見つかりませんでした。次回の同期でやり直します。"

export type SyncMessageKey =
  | "gitSyncFailed"
  | "gitSyncCursorInvalid"
  | "gitSyncStationTruncated"
  | "gitSyncStationHostNotAllowed"
  | "gitSyncStationNotBound"
  | "gitSyncStationHeld"
  | "gitSyncStationQuarantined"
  | "gitSyncStationNoIntegration"
  | "gitSyncStationAuth"
  | "gitSyncStationForbidden"
  | "gitSyncStationNotFound"
  | "gitSyncStationGone"
  | "gitSyncStationRateLimited"
  | "gitSyncStationUnavailable"
  | "gitSyncStationNetwork"
  | "gitSyncStationInvalidResponse"
  | "gitSyncAcceptanceRefused"
  | "gitSyncAcceptanceCommitMissing"

/** The translations `syncMessageText` reads (lib/i18n/git has them all). `gitSyncStationHttp` carries `{status}`. */
export type SyncMessageTranslations = Readonly<Record<SyncMessageKey | "gitSyncStationHttp", string>>

const KEYS: ReadonlyMap<string, SyncMessageKey> = new Map<string, SyncMessageKey>([
  [SYNC_FAILED_MESSAGE, "gitSyncFailed"],
  [CURSOR_INVALID_MESSAGE, "gitSyncCursorInvalid"],
  [STATION_TRUNCATED_MESSAGE, "gitSyncStationTruncated"],
  [STATION_TRUNCATED_MESSAGE_K3, "gitSyncStationTruncated"],
  [STATION_HOST_NOT_ALLOWED_MESSAGE, "gitSyncStationHostNotAllowed"],
  [STATION_NOT_BOUND_MESSAGE, "gitSyncStationNotBound"],
  [STATION_HELD_MESSAGE, "gitSyncStationHeld"],
  [STATION_QUARANTINED_MESSAGE, "gitSyncStationQuarantined"],
  [STATION_MISSING_INTEGRATION_MESSAGE, "gitSyncStationNoIntegration"],
  [STATION_AUTH_MESSAGE, "gitSyncStationAuth"],
  [STATION_FORBIDDEN_MESSAGE, "gitSyncStationForbidden"],
  [STATION_NOT_FOUND_MESSAGE, "gitSyncStationNotFound"],
  [STATION_GONE_MESSAGE, "gitSyncStationGone"],
  [STATION_RATE_LIMITED_MESSAGE, "gitSyncStationRateLimited"],
  [STATION_UNAVAILABLE_MESSAGE, "gitSyncStationUnavailable"],
  [STATION_NETWORK_MESSAGE, "gitSyncStationNetwork"],
  [STATION_INVALID_RESPONSE_MESSAGE, "gitSyncStationInvalidResponse"],
  [ACCEPTANCE_REPORT_REFUSED_MESSAGE, "gitSyncAcceptanceRefused"],
  [ACCEPTANCE_COMMIT_MISSING_MESSAGE, "gitSyncAcceptanceCommitMissing"],
])

/** i18n key of a stored lastError that is one fixed text, or null. */
export function syncMessageKey(lastError: string | null | undefined): SyncMessageKey | null {
  return lastError ? (KEYS.get(lastError) ?? null) : null
}

/** A stored lastError in the viewer's language; a text that is not one of the known ones is shown as stored. */
export function syncMessageText(lastError: string, t: SyncMessageTranslations): string {
  const key = syncMessageKey(lastError)
  if (key) return t[key]
  const http = STATION_HTTP_MESSAGE.exec(lastError)
  return http ? t.gitSyncStationHttp.replace("{status}", http[1]) : lastError
}
