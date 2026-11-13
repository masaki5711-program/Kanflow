import { describe, expect, it } from "vitest"
import { en, id, ja } from "@/lib/i18n/git"
import {
  ACCEPTANCE_COMMIT_MISSING_MESSAGE,
  ACCEPTANCE_REPORT_REFUSED_MESSAGE,
  CURSOR_INVALID_MESSAGE,
  INDEX_FAILED_MESSAGE,
  INDEX_TOKEN_MISSING_MESSAGE,
  KNOWLEDGE_LISTING_INCOMPLETE_MESSAGE,
  KNOWLEDGE_LISTING_SLOW_MESSAGE,
  STATION_AUTH_MESSAGE,
  STATION_CSRF_REFUSED_MESSAGE,
  STATION_FORBIDDEN_MESSAGE,
  STATION_GONE_MESSAGE,
  STATION_HELD_MESSAGE,
  STATION_HOST_NOT_ALLOWED_MESSAGE,
  STATION_INVALID_RESPONSE_MESSAGE,
  STATION_MISSING_INTEGRATION_MESSAGE,
  STATION_NETWORK_MESSAGE,
  STATION_NOT_BOUND_MESSAGE,
  STATION_NOT_FOUND_MESSAGE,
  STATION_QUARANTINED_MESSAGE,
  STATION_RATE_LIMITED_MESSAGE,
  STATION_TRUNCATED_MESSAGE,
  STATION_UNAVAILABLE_MESSAGE,
  stationHttpMessage,
  SYNC_FAILED_MESSAGE,
  syncMessageKey,
  syncMessageText,
  type SyncMessageKey,
} from "../sync-messages"

/** Every fixed text the server stores, with the key the UI reads it by. */
const STORED: Record<SyncMessageKey, string> = {
  gitSyncFailed: SYNC_FAILED_MESSAGE,
  gitSyncCursorInvalid: CURSOR_INVALID_MESSAGE,
  gitSyncStationTruncated: STATION_TRUNCATED_MESSAGE,
  gitSyncStationHostNotAllowed: STATION_HOST_NOT_ALLOWED_MESSAGE,
  gitSyncStationNotBound: STATION_NOT_BOUND_MESSAGE,
  gitSyncStationHeld: STATION_HELD_MESSAGE,
  gitSyncStationQuarantined: STATION_QUARANTINED_MESSAGE,
  gitSyncStationNoIntegration: STATION_MISSING_INTEGRATION_MESSAGE,
  gitSyncStationAuth: STATION_AUTH_MESSAGE,
  gitSyncStationForbidden: STATION_FORBIDDEN_MESSAGE,
  gitSyncStationCsrfRefused: STATION_CSRF_REFUSED_MESSAGE,
  gitSyncStationNotFound: STATION_NOT_FOUND_MESSAGE,
  gitSyncStationGone: STATION_GONE_MESSAGE,
  gitSyncStationRateLimited: STATION_RATE_LIMITED_MESSAGE,
  gitSyncStationUnavailable: STATION_UNAVAILABLE_MESSAGE,
  gitSyncStationNetwork: STATION_NETWORK_MESSAGE,
  gitSyncStationInvalidResponse: STATION_INVALID_RESPONSE_MESSAGE,
  gitSyncAcceptanceRefused: ACCEPTANCE_REPORT_REFUSED_MESSAGE,
  gitSyncAcceptanceCommitMissing: ACCEPTANCE_COMMIT_MISSING_MESSAGE,
  gitSyncIndexFailed: INDEX_FAILED_MESSAGE,
  gitSyncIndexNoToken: INDEX_TOKEN_MISSING_MESSAGE,
  gitSyncKnowledgeListingSlow: KNOWLEDGE_LISTING_SLOW_MESSAGE,
  gitSyncKnowledgeListingIncomplete: KNOWLEDGE_LISTING_INCOMPLETE_MESSAGE,
}
const entries = Object.entries(STORED) as [SyncMessageKey, string][]

describe("stored sync messages", () => {
  it.each(entries)("%s: the stored text is found again, and ja is that text", (key, message) => {
    expect(syncMessageKey(message)).toBe(key)
    expect(ja[key]).toBe(message)
    expect(syncMessageText(message, ja)).toBe(message)
  })

  it.each(entries)("%s: en and id are translations, not the stored text", (key, message) => {
    for (const t of [en, id]) {
      expect(t[key].length).toBeGreaterThan(10)
      expect(t[key]).not.toBe(message)
      expect(syncMessageText(message, t)).toBe(t[key])
    }
    expect(id[key]).not.toBe(en[key])
  })

  it("no two keys share a stored text (each text reads back as one key)", () => {
    expect(new Set(Object.values(STORED)).size).toBe(entries.length)
  })

  it("the wording GitStation's truncation had before is still translated", () => {
    const k3 = "GitStation の状態の取り直しが上限（マージリクエスト 2000 件）を超えました。管理者に連絡してください。"
    expect(syncMessageText(k3, en)).toBe(en.gitSyncStationTruncated)
  })

  it("a status without a text of its own keeps the status in every language", () => {
    expect(syncMessageText(stationHttpMessage(500), ja)).toBe(stationHttpMessage(500))
    expect(syncMessageText(stationHttpMessage(500), en)).toBe("GitStation returned an error (500). The next sync tries again.")
    expect(syncMessageText(stationHttpMessage(418), id)).toBe(id.gitSyncStationHttp.replace("{status}", "418"))
    expect(syncMessageText(stationHttpMessage(undefined), en)).toBe(en.gitSyncStationHttp.replace("{status}", "?"))
    expect(syncMessageKey(stationHttpMessage(500))).toBeNull()
  })

  it("a text that is not one of them is shown as stored", () => {
    expect(syncMessageText("GitLab に接続できませんでした。", en)).toBe("GitLab に接続できませんでした。")
    expect(syncMessageText(`${STATION_AUTH_MESSAGE} `, en)).toBe(`${STATION_AUTH_MESSAGE} `)
    expect(syncMessageKey(null)).toBeNull()
    expect(syncMessageKey("")).toBeNull()
  })
})

describe("placeholders the components split on", () => {
  const count = (text: string, part: string) => text.split(part).length - 1

  it.each([
    ["ja", ja],
    ["en", en],
    ["id", id],
  ] as const)("%s has each placeholder exactly once", (_language, t) => {
    expect(count(t.gitSetAcceptanceCheckError, "{time}")).toBe(1)
    expect(count(t.gitStatusError, "{time}")).toBe(1)
    expect(count(t.gitStatusSynced, "{time}")).toBe(1)
    expect(count(t.gitSyncStationHttp, "{status}")).toBe(1)
    expect(t.gitSetAcceptanceCheckErrorNoTime).not.toContain("{")
  })
})
