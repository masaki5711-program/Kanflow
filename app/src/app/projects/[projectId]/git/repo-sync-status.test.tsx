import { describe, expect, it } from "vitest"
import { screen } from "@testing-library/react"
import { getTranslations } from "@/lib/i18n"
import { CURSOR_INVALID_MESSAGE, syncMessageKey } from "@/lib/git/sync-messages"
import { renderWithProviders } from "../settings/__tests__/providers"
import { RepoSyncStatus } from "./repo-sync-status"

const NOW = new Date("2026-10-01T00:00:00.000Z")
const failed = (lastError: string) => ({ syncedAt: null, lastError, lastErrorAt: NOW.toISOString() })

describe("RepoSyncStatus — stored messages in the viewer's language", () => {
  it.each(["ja", "en", "id"] as const)("shows the unreadable-cursor message in %s", (language) => {
    renderWithProviders(<RepoSyncStatus repo={failed(CURSOR_INVALID_MESSAGE)} now={NOW} />, { language })
    expect(screen.getByText(getTranslations(language).gitSyncCursorInvalid, { exact: false })).toBeInTheDocument()
  })

  it("shows any other stored message as stored", () => {
    renderWithProviders(<RepoSyncStatus repo={failed("GitLab に接続できませんでした。")} now={NOW} />, { language: "en" })
    expect(screen.getByText("GitLab に接続できませんでした。", { exact: false })).toBeInTheDocument()
  })

  it("the ja translation is the stored text itself", () => {
    expect(getTranslations("ja").gitSyncCursorInvalid).toBe(CURSOR_INVALID_MESSAGE)
    expect(syncMessageKey(null)).toBeNull()
    expect(syncMessageKey("other")).toBeNull()
  })
})
