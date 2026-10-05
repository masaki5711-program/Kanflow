import { describe, expect, it } from "vitest"
import { allMergeRequestsMerged, linksFromBranch, linksFromCommit, linksFromMergeRequest, safeUrl } from "../git-links"
import type { GitLabBranch, GitLabCommit, GitLabMergeRequest } from "@/lib/git/gitlab-client"

const NOW = new Date("2026-10-01T00:00:00.000Z")

function mr(overrides: Partial<GitLabMergeRequest> = {}): GitLabMergeRequest {
  return {
    iid: 10,
    title: "PBI-3 login form",
    description: "related to PBI-99 (should be ignored)",
    state: "opened",
    web_url: "https://gitlab/x/-/merge_requests/10",
    source_branch: "feature/PBI-3-login",
    updated_at: "2026-09-30T12:00:00.000Z",
    merged_at: null,
    author: { name: "Alice", username: "alice" },
    ...overrides,
  }
}

describe("linksFromMergeRequest", () => {
  it("reads PBI numbers from the title and source branch, not the description", () => {
    const drafts = linksFromMergeRequest(mr(), NOW)
    expect(drafts.map((d) => d.pbiNumber)).toEqual([3])
  })

  it("builds one draft per distinct PBI number mentioned (title + branch combined, deduped)", () => {
    const drafts = linksFromMergeRequest(mr({ title: "PBI-3 and PBI-5", source_branch: "feature/PBI-5-x" }), NOW)
    expect(drafts.map((d) => d.pbiNumber)).toEqual([3, 5])
  })

  it("maps every field of a merge request", () => {
    const [draft] = linksFromMergeRequest(mr(), NOW)
    expect(draft).toEqual({
      kind: "mr",
      ref: "10",
      pbiNumber: 3,
      title: "PBI-3 login form",
      url: "https://gitlab/x/-/merge_requests/10",
      state: "opened",
      pipeline: null,
      author: "Alice",
      sourceBranch: "feature/PBI-3-login",
      occurredAt: new Date("2026-09-30T12:00:00.000Z"),
      mergedAt: null,
    })
  })

  it("falls back to the username when the author has no display name", () => {
    const [draft] = linksFromMergeRequest(mr({ author: { username: "alice" } }), NOW)
    expect(draft.author).toBe("alice")
  })

  it("author is null when there is no author at all", () => {
    const [draft] = linksFromMergeRequest(mr({ author: null }), NOW)
    expect(draft.author).toBeNull()
  })

  it("falls back to `now` for an invalid or missing updated_at", () => {
    const [draft] = linksFromMergeRequest(mr({ updated_at: "not-a-date" }), NOW)
    expect(draft.occurredAt).toEqual(NOW)
  })

  it("mergedAt is null unless merged_at is set, and falls back to `now` if it is an invalid date", () => {
    expect(linksFromMergeRequest(mr({ merged_at: null }), NOW)[0].mergedAt).toBeNull()
    expect(linksFromMergeRequest(mr({ merged_at: "2026-09-29T00:00:00.000Z" }), NOW)[0].mergedAt).toEqual(new Date("2026-09-29T00:00:00.000Z"))
    expect(linksFromMergeRequest(mr({ merged_at: "garbage" }), NOW)[0].mergedAt).toEqual(NOW)
  })

  it("truncates oversized title / url / state / author / sourceBranch", () => {
    const [draft] = linksFromMergeRequest(
      mr({ title: "PBI-3 " + "x".repeat(600), web_url: "https://" + "u".repeat(2000), state: "opened-and-then-some-extra-chars", source_branch: "b".repeat(400) }),
      NOW,
    )
    expect(draft.title.length).toBe(500)
    expect(draft.url.length).toBe(1024)
    expect(draft.state!.length).toBe(16)
    expect(draft.sourceBranch!.length).toBe(255)
  })

  it("returns an empty array when no PBI number is mentioned", () => {
    expect(linksFromMergeRequest(mr({ title: "no ticket here", source_branch: "main" }), NOW)).toEqual([])
  })
})

function branch(overrides: Partial<GitLabBranch> = {}): GitLabBranch {
  return {
    name: "feature/PBI-8-x",
    web_url: "https://gitlab/x/-/tree/feature/PBI-8-x",
    commit: { committed_date: "2026-09-28T00:00:00.000Z", author_name: "Bob", title: "Add feature" },
    ...overrides,
  }
}

describe("linksFromBranch", () => {
  it("reads the PBI number from the branch name", () => {
    expect(linksFromBranch(branch(), NOW)[0].pbiNumber).toBe(8)
  })

  it("maps every field, using the commit title and author", () => {
    const [draft] = linksFromBranch(branch(), NOW)
    expect(draft).toEqual({
      kind: "branch",
      ref: "feature/PBI-8-x",
      pbiNumber: 8,
      title: "Add feature",
      url: "https://gitlab/x/-/tree/feature/PBI-8-x",
      state: null,
      pipeline: null,
      author: "Bob",
      sourceBranch: "feature/PBI-8-x",
      occurredAt: new Date("2026-09-28T00:00:00.000Z"),
      mergedAt: null,
    })
  })

  it("falls back to the branch name as the title when there is no commit", () => {
    expect(linksFromBranch(branch({ commit: null }), NOW)[0].title).toBe("feature/PBI-8-x")
  })

  it("falls back to `now` when there is no committed date", () => {
    expect(linksFromBranch(branch({ commit: undefined }), NOW)[0].occurredAt).toEqual(NOW)
  })

  it("author is null without a commit author", () => {
    expect(linksFromBranch(branch({ commit: { title: "t" } }), NOW)[0].author).toBeNull()
  })

  it("returns an empty array for a branch with no PBI number", () => {
    expect(linksFromBranch(branch({ name: "main" }), NOW)).toEqual([])
  })
})

function commit(overrides: Partial<GitLabCommit> = {}): GitLabCommit {
  return {
    id: "abcdef1234567890abcdef1234567890abcdef12",
    short_id: "abcdef12",
    title: "Short title",
    message: "Fixes PBI-21\n\nLonger body",
    web_url: "https://gitlab/x/-/commit/abcdef1234567890abcdef1234567890abcdef12",
    author_name: "Carol",
    committed_date: "2026-09-27T00:00:00.000Z",
    ...overrides,
  }
}

describe("linksFromCommit", () => {
  it("reads PBI numbers from the full message (not just the title)", () => {
    expect(linksFromCommit(commit(), NOW)[0].pbiNumber).toBe(21)
  })

  it("maps every field; ref is the sha capped at 40 chars, mergedAt and sourceBranch are always null", () => {
    const [draft] = linksFromCommit(commit(), NOW)
    expect(draft).toEqual({
      kind: "commit",
      ref: "abcdef1234567890abcdef1234567890abcdef12",
      pbiNumber: 21,
      title: "Short title",
      url: "https://gitlab/x/-/commit/abcdef1234567890abcdef1234567890abcdef12",
      state: null,
      pipeline: null,
      author: "Carol",
      sourceBranch: null,
      occurredAt: new Date("2026-09-27T00:00:00.000Z"),
      mergedAt: null,
    })
  })

  it("caps the ref at 40 characters even for a longer id", () => {
    const [draft] = linksFromCommit(commit({ id: "a".repeat(64) }), NOW)
    expect(draft.ref).toBe("a".repeat(40))
  })

  it("returns an empty array when the message has no PBI number", () => {
    expect(linksFromCommit(commit({ message: "chore: bump deps" }), NOW)).toEqual([])
  })
})

describe("allMergeRequestsMerged", () => {
  it("is true with one merged state and nothing open or locked", () => {
    expect(allMergeRequestsMerged(["merged"])).toBe(true)
    expect(allMergeRequestsMerged(["merged", "closed"])).toBe(true)
  })

  it("is false when nothing is merged", () => {
    expect(allMergeRequestsMerged([])).toBe(false)
    expect(allMergeRequestsMerged(["closed"])).toBe(false)
  })

  it("is false while any MR is still open or locked, even if another is merged", () => {
    expect(allMergeRequestsMerged(["merged", "opened"])).toBe(false)
    expect(allMergeRequestsMerged(["merged", "locked"])).toBe(false)
  })

  it("ignores null states", () => {
    expect(allMergeRequestsMerged(["merged", null])).toBe(true)
  })
})

describe("safeUrl", () => {
  it("keeps https URLs and drops anything else", () => {
    expect(safeUrl("https://gitlab.example/a/b/-/merge_requests/1")).toBe("https://gitlab.example/a/b/-/merge_requests/1")
    expect(safeUrl("javascript:alert(1)")).toBe("")
    expect(safeUrl("http://gitlab.example/a")).toBe("")
    expect(safeUrl(null)).toBe("")
  })
})
