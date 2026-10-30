import { parseGitProvider, type GitProvider } from "./git-provider"
import { gitLabSourceKind, type ClientFactory } from "./gitlab-source"
import type { TagDraft } from "./gitlab-release-tags"

/**
 * DevSource: the thin, swappable layer between the sync (git-sync) and the
 * system development data is read from. GitLab today (gitlab-source); a
 * GitStationSource replaces it for projects that moved (M3). A project reads
 * exactly one source (git-provider).
 *
 * The sync stores and hands back an OPAQUE cursor: only the source that made a
 * cursor understands it. Where the cursor lives is the source's business too
 * (`DevCursorCodec`: the GitLab source keeps its per-listing columns on
 * git_repository, so existing rows and the resync keep working unchanged).
 */

/** Opaque position of one repository's listings. Never parsed outside its source. */
export type DevCursor = string & { readonly __devCursor: unique symbol }

/** Normalized records (strings as the source sent them; git-links validates / truncates). */
export interface DevMergeRequest {
  /** Stable per repository (GitLab: the iid). */
  ref: string
  title: string
  state: string
  url: string
  sourceBranch: string
  author: string | null
  updatedAt: string
  mergedAt: string | null
}

export interface DevCommit {
  sha: string
  title: string
  message: string
  url: string
  author: string
  committedAt: string
}

export interface DevBranch {
  name: string
  url: string
  /** Head commit (any may be missing). */
  headTitle: string | null
  headAuthor: string | null
  headCommittedAt: string | null
}

/** The sync's listings (also the labels of a failure message). */
export type DevListingKind = "mr" | "commit" | "commit-lookback" | "branch"

export interface DevListingFailure {
  kind: DevListingKind
  error: unknown
}

/** Merge requests and commits changed since a cursor. Never throws for a failed listing (see `failures`). */
export interface DevChanges {
  mergeRequests: DevMergeRequest[]
  /** Refs of merge requests past the cursor (not only re-read for safety): their pipelines are looked up. */
  freshMergeRequestRefs: ReadonlySet<string>
  commits: DevCommit[]
  /** Where the next sync continues; never past anything not returned. */
  cursor: DevCursor
  /** Listings that failed (not logged by the source: the sync logs each once). */
  failures: DevListingFailure[]
}

export interface DevBranchListing {
  items: DevBranch[]
  /** false = cut short: absence from `items` proves nothing (no branch is marked gone). */
  complete: boolean
}

export interface DevReleaseListing {
  drafts: TagDraft[]
  /** false = cut short: a tag missing from `drafts` is not deleted. */
  complete: boolean
}

/** How a source failure is logged and shown. */
export interface DevSourceErrorInfo {
  /** Short machine kind returned by the sync ("auth", "network", ...). */
  kind: string
  /** An answer of the remote system (logged as a warning), not a defect (logged as an error). */
  expected: boolean
  status?: number
  /** Japanese text stored on the repository and shown in settings. */
  message: string
}

/** One repository of one source, connected with its token. */
export interface DevSource {
  readonly provider: GitProvider
  /** The source's id of the repository (resolved once, stored as git_repository.externalId). */
  locate(): Promise<number>
  readChanges(cursor: DevCursor, now: Date): Promise<DevChanges>
  /** The PBI branches (throws on failure). */
  listBranches(now: Date): Promise<DevBranchListing>
  /** Pipeline status of a merge request (throws on failure). */
  pipelineStatus(mergeRequestRef: string): Promise<string | null>
  /** Tags / releases (throws on failure). */
  listReleaseTags(webUrl: string, now: Date): Promise<DevReleaseListing>
  describeError(error: unknown): DevSourceErrorInfo
}

/** Stored repository columns of a source's cursor (opaque to the sync: it only spreads them into the row). */
export type DevCursorColumns = object

export interface DevCursorCodec {
  /** The repository's stored position (a never-synced row gets the first-sync start). */
  fromRow(row: object, now: Date): DevCursor
  toRow(cursor: DevCursor): DevCursorColumns
  /** 過去分を再同期: the position that re-reads the last days again. */
  restart(cursor: DevCursor, now: Date): DevCursor
}

export interface DevConnection {
  repositoryId: string
  apiBase: string
  repoPath: string
  externalId: number | null
  token: string
}

/** Per-provider client factories (tests inject fakes; production uses the defaults). */
export interface DevClients {
  gitlab?: ClientFactory
}

export interface DevSourceKind {
  readonly provider: GitProvider
  readonly cursors: DevCursorCodec
  connect(connection: DevConnection, clients?: DevClients): DevSource
}

const KINDS: Readonly<Record<GitProvider, DevSourceKind>> = { gitlab: gitLabSourceKind }

/** The source kind of a provider; UnsupportedProviderError for anything else. */
export function devSourceFor(provider: unknown): DevSourceKind {
  return KINDS[parseGitProvider(provider)]
}
