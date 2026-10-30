import { vi } from "vitest"
import type { GitLinkDto, PbiGitPanelDto } from "../git-client-state"

export const REPO_WEB = { id: "r-web", name: "web-frontend" }
export const REPO_API = { id: "r-api", name: "api-server" }

let seq = 0

export function link(over: Partial<GitLinkDto> & Pick<GitLinkDto, "kind">): GitLinkDto {
  seq += 1
  return {
    id: `l${seq}`,
    ref: String(seq),
    title: `Change ${seq}`,
    url: `https://gitlab.example.test/x/-/${seq}`,
    state: null,
    pipeline: null,
    author: "Taro",
    sourceBranch: null,
    occurredAt: "2026-10-01T09:00:00.000Z",
    mergedAt: null,
    goneAt: null,
    repository: REPO_WEB,
    ...over,
  }
}

export function panel(over: Partial<PbiGitPanelDto> = {}): PbiGitPanelDto {
  return { enabled: true, pbiKey: "PBI-12", branchSuggestion: "feature/PBI-12-faster-login", hasRepositories: true, links: [], ...over }
}

/** Installs a clipboard stub (call after `userEvent.setup()`, which installs its own). */
export function stubClipboard() {
  const writeText = vi.fn(async () => {})
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
  return writeText
}
