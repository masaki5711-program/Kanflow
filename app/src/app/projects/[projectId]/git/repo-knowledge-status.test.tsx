import { describe, expect, it } from "vitest"
import { screen } from "@testing-library/react"
import { getTranslations } from "@/lib/i18n"
import { KNOWLEDGE_LISTING_SLOW_MESSAGE, STATION_NOT_BOUND_MESSAGE } from "@/lib/git/sync-messages"
import { renderWithProviders } from "../settings/__tests__/providers"
import { RepoKnowledgeStatus } from "./repo-knowledge-status"

/** The import error of the AI reference material is stored in Japanese and shown in the viewer's language. */
const NOW = new Date("2026-11-10T12:00:00Z")
const repo = (indexError: string | null) => ({
  aiKnowledge: true,
  indexedAt: null,
  indexedFiles: 0,
  indexError,
  indexErrorAt: "2026-11-10T11:58:00Z",
  indexing: false,
  indexPending: false,
})

describe("RepoKnowledgeStatus", () => {
  it.each(["en", "id"] as const)("shows a stored GitStation text in %s", (language) => {
    const t = getTranslations(language)
    renderWithProviders(<RepoKnowledgeStatus repo={repo(KNOWLEDGE_LISTING_SLOW_MESSAGE)} now={NOW} />, { language })
    expect(screen.getByText(t.gitSyncKnowledgeListingSlow)).toBeInTheDocument()
    expect(screen.queryByText(KNOWLEDGE_LISTING_SLOW_MESSAGE)).toBeNull()
  })

  it("shows a binding problem in English to an English reader", () => {
    renderWithProviders(<RepoKnowledgeStatus repo={repo(STATION_NOT_BOUND_MESSAGE)} now={NOW} />, { language: "en" })
    expect(screen.getByText(getTranslations("en").gitSyncStationNotBound)).toBeInTheDocument()
  })

  it("shows a text it does not know as stored", () => {
    renderWithProviders(<RepoKnowledgeStatus repo={repo("GitLab のトークンが無効です")} now={NOW} />, { language: "en" })
    expect(screen.getByText("GitLab のトークンが無効です")).toBeInTheDocument()
  })
})
