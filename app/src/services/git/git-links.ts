import { extractPbiNumbers } from "@/lib/git/pbi-keys"
import type { GitLabBranch, GitLabCommit, GitLabMergeRequest } from "@/lib/git/gitlab-client"

/**
 * GitLab objects → link rows (pure). One row per (object, PBI number); the
 * caller resolves numbers to PBI ids and drops unknown numbers.
 */
export type GitLinkKind = "mr" | "branch" | "commit"

export interface LinkDraft {
  kind: GitLinkKind
  ref: string
  pbiNumber: number
  title: string
  url: string
  state: string | null
  pipeline: string | null
  author: string | null
  sourceBranch: string | null
  occurredAt: Date
  mergedAt: Date | null
}

const cut = (s: string | null | undefined, max: number) => (s ?? "").slice(0, max)

/** Links are rendered as <a href>: keep only https URLs (defence in depth; GitLab sends https). */
export function safeUrl(s: string | null | undefined): string {
  const url = cut(s, 1024)
  return /^https:\/\//i.test(url) ? url : ""
}

function date(s: string | null | undefined, fallback: Date): Date {
  const d = s ? new Date(s) : null
  return d && !Number.isNaN(d.getTime()) ? d : fallback
}

/** MR keys come from the title and the source branch (not the description: "related to PBI-3" is noise). */
export function linksFromMergeRequest(mr: GitLabMergeRequest, now: Date): LinkDraft[] {
  return extractPbiNumbers(mr.title, mr.source_branch).map((pbiNumber) => ({
    kind: "mr",
    ref: String(mr.iid),
    pbiNumber,
    title: cut(mr.title, 500),
    url: safeUrl(mr.web_url),
    state: cut(mr.state, 16) || null,
    pipeline: null,
    author: cut(mr.author?.name ?? mr.author?.username, 191) || null,
    sourceBranch: cut(mr.source_branch, 255) || null,
    occurredAt: date(mr.updated_at, now),
    mergedAt: mr.merged_at ? date(mr.merged_at, now) : null,
  }))
}

export function linksFromBranch(branch: GitLabBranch, now: Date): LinkDraft[] {
  return extractPbiNumbers(branch.name).map((pbiNumber) => ({
    kind: "branch",
    ref: cut(branch.name, 255),
    pbiNumber,
    title: cut(branch.commit?.title ?? branch.name, 500),
    url: safeUrl(branch.web_url),
    state: null,
    pipeline: null,
    author: cut(branch.commit?.author_name, 191) || null,
    sourceBranch: cut(branch.name, 255),
    occurredAt: date(branch.commit?.committed_date, now),
    mergedAt: null,
  }))
}

/** Commit keys come from the whole message ("Refs PBI-12" in the body is common). */
export function linksFromCommit(commit: GitLabCommit, now: Date): LinkDraft[] {
  return extractPbiNumbers(commit.message).map((pbiNumber) => ({
    kind: "commit",
    ref: commit.id.slice(0, 40),
    pbiNumber,
    title: cut(commit.title, 500),
    url: safeUrl(commit.web_url),
    state: null,
    pipeline: null,
    author: cut(commit.author_name, 191) || null,
    sourceBranch: null,
    occurredAt: date(commit.committed_date, now),
    mergedAt: null,
  }))
}

/**
 * Auto-complete rule: a PBI's merge requests are "all merged" when it has at
 * least one merged MR and none still open (closed-unmerged ones are ignored).
 */
export function allMergeRequestsMerged(states: ReadonlyArray<string | null>): boolean {
  return states.includes("merged") && !states.some((s) => s === "opened" || s === "locked")
}
