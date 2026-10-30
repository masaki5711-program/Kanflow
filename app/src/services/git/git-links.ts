import { extractPbiNumbers } from "@/lib/git/pbi-keys"
import type { DevBranch, DevCommit, DevMergeRequest } from "./dev-source"

/**
 * Normalized source records (dev-source) → link rows (pure). One row per (object, PBI number); the
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
export function linksFromMergeRequest(mr: DevMergeRequest, now: Date): LinkDraft[] {
  return extractPbiNumbers(mr.title, mr.sourceBranch).map((pbiNumber) => ({
    kind: "mr",
    ref: mr.ref,
    pbiNumber,
    title: cut(mr.title, 500),
    url: safeUrl(mr.url),
    state: cut(mr.state, 16) || null,
    pipeline: null,
    author: cut(mr.author, 191) || null,
    sourceBranch: cut(mr.sourceBranch, 255) || null,
    occurredAt: date(mr.updatedAt, now),
    mergedAt: mr.mergedAt ? date(mr.mergedAt, now) : null,
  }))
}

export function linksFromBranch(branch: DevBranch, now: Date): LinkDraft[] {
  return extractPbiNumbers(branch.name).map((pbiNumber) => ({
    kind: "branch",
    ref: cut(branch.name, 255),
    pbiNumber,
    title: cut(branch.headTitle ?? branch.name, 500),
    url: safeUrl(branch.url),
    state: null,
    pipeline: null,
    author: cut(branch.headAuthor, 191) || null,
    sourceBranch: cut(branch.name, 255),
    occurredAt: date(branch.headCommittedAt, now),
    mergedAt: null,
  }))
}

/** Commit keys come from the whole message ("Refs PBI-12" in the body is common). */
export function linksFromCommit(commit: DevCommit, now: Date): LinkDraft[] {
  return extractPbiNumbers(commit.message).map((pbiNumber) => ({
    kind: "commit",
    ref: commit.sha.slice(0, 40),
    pbiNumber,
    title: cut(commit.title, 500),
    url: safeUrl(commit.url),
    state: null,
    pipeline: null,
    author: cut(commit.author, 191) || null,
    sourceBranch: null,
    occurredAt: date(commit.committedAt, now),
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
