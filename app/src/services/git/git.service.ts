import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { open, seal, secretHint } from "@/lib/secret-box"
import { accessLevelOf, createGitLabClient, GitLabError, REPORTER_ACCESS_LEVEL } from "@/lib/git/gitlab-client"
import { parseRepoUrl } from "@/lib/git/repo-url"
import { pbiKey, suggestBranchName } from "@/lib/git/pbi-keys"
import { NotFoundError, ValidationError } from "@/services/_shared/errors"
import { logActivity, type ActivityChanges } from "@/services/_shared/activity"
import type { Actor } from "@/services/_shared/actor"
import { FORBIDDEN_MESSAGE, syncErrorMessage } from "./git-sync"

/**
 * GitLab integration settings and read models. The access token is write-only:
 * responses carry `hasToken` and the last four characters, never the token.
 */

/** Repositories per project (a product with front end / API / edge / tools fits easily). */
export const MAX_REPOSITORIES = 20
const MAX_TOKEN_LENGTH = 200

const tokenField = z.string().trim().min(8).max(MAX_TOKEN_LENGTH)

export const gitSettingsSchema = z
  .object({
    enabled: z.boolean().optional(),
    /** string = replace, null = remove, absent = keep. */
    token: tokenField.nullable().optional(),
    autoCompleteOnMerge: z.boolean().optional(),
  })
  .strict()
export type GitSettingsInput = z.infer<typeof gitSettingsSchema>

export const addRepositorySchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    url: z.string().trim().min(1).max(1000),
    /** Optional per-repository token; otherwise the integration token is used. */
    token: tokenField.optional(),
  })
  .strict()

export const updateRepositorySchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    token: tokenField.nullable().optional(),
  })
  .strict()

export const testConnectionSchema = z.object({ url: z.string().trim().min(1).max(1000), token: tokenField.optional() }).strict()

export interface GitRepositoryDto {
  id: string
  name: string
  webUrl: string
  repoPath: string
  hasOwnToken: boolean
  tokenHint: string | null
  syncedAt: string | null
  lastError: string | null
  lastErrorAt: string | null
}

export interface GitSettingsDto {
  enabled: boolean
  hasToken: boolean
  tokenHint: string | null
  autoCompleteOnMerge: boolean
  repositories: GitRepositoryDto[]
  /** Seconds between automatic syncs (lib/git/poller). */
  pollIntervalSec: number
}

export function pollIntervalSec(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.GIT_SYNC_INTERVAL_SEC)
  return Number.isFinite(n) && n >= 60 ? Math.floor(n) : 180
}

type RepoRow = Awaited<ReturnType<typeof prisma.gitRepository.findMany>>[number]

function toRepoDto(r: RepoRow): GitRepositoryDto {
  return {
    id: r.id,
    name: r.name,
    webUrl: r.webUrl,
    repoPath: r.repoPath,
    hasOwnToken: !!r.tokenCipher,
    tokenHint: r.tokenHint,
    syncedAt: r.syncedAt?.toISOString() ?? null,
    lastError: r.lastError,
    lastErrorAt: r.lastErrorAt?.toISOString() ?? null,
  }
}

async function assertProject(projectId: string): Promise<void> {
  const p = await prisma.project.findFirst({ where: { id: projectId, deletedAt: null }, select: { id: true } })
  if (!p) throw new NotFoundError("Project not found")
}

/** True when the project has the integration switched on (drives every Git UI). */
export async function isGitEnabled(projectId: string): Promise<boolean> {
  const row = await prisma.gitIntegration.findUnique({ where: { projectId }, select: { enabled: true } })
  return row?.enabled ?? false
}

export async function getGitSettings(projectId: string): Promise<GitSettingsDto> {
  await assertProject(projectId)
  const [integration, repos] = await Promise.all([
    prisma.gitIntegration.findUnique({ where: { projectId } }),
    prisma.gitRepository.findMany({ where: { projectId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
  ])
  return {
    enabled: integration?.enabled ?? false,
    hasToken: !!integration?.tokenCipher,
    tokenHint: integration?.tokenHint ?? null,
    autoCompleteOnMerge: integration?.autoCompleteOnMerge ?? false,
    repositories: repos.map(toRepoDto),
    pollIntervalSec: pollIntervalSec(),
  }
}

export async function updateGitSettings(projectId: string, input: GitSettingsInput, actor: Actor): Promise<GitSettingsDto> {
  await assertProject(projectId)
  const tokenPatch =
    input.token === undefined ? {} : input.token === null ? { tokenCipher: null, tokenHint: null } : { tokenCipher: seal(input.token), tokenHint: secretHint(input.token) }
  const patch = {
    ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    ...(input.autoCompleteOnMerge !== undefined ? { autoCompleteOnMerge: input.autoCompleteOnMerge } : {}),
    ...tokenPatch,
  }
  const before = await prisma.gitIntegration.findUnique({ where: { projectId }, select: { enabled: true, autoCompleteOnMerge: true } })
  await prisma.gitIntegration.upsert({ where: { projectId }, create: { projectId, ...patch }, update: patch })
  const changes: ActivityChanges = {}
  if (input.enabled !== undefined && input.enabled !== (before?.enabled ?? false)) changes["git.enabled"] = { from: before?.enabled ?? false, to: input.enabled }
  if (input.autoCompleteOnMerge !== undefined && input.autoCompleteOnMerge !== (before?.autoCompleteOnMerge ?? false))
    changes["git.autoCompleteOnMerge"] = { from: before?.autoCompleteOnMerge ?? false, to: input.autoCompleteOnMerge }
  // The token itself never goes to the log; only that it changed.
  if (input.token !== undefined) changes["git.token"] = { from: "•••", to: input.token === null ? null : "•••" }
  if (Object.keys(changes).length > 0) {
    await logActivity(prisma, { projectId, entityType: "project", entityId: projectId, action: "update", actor, diff: { changes } })
  }
  return getGitSettings(projectId)
}

export interface ConnectionResult {
  ok: boolean
  /** GitLab-side facts on success. */
  repository?: { path: string; webUrl: string; defaultBranch: string | null; externalId: number }
  /** Japanese explanation on failure. */
  error?: string
}

/** Token to use for a repository URL test: the given one, else the integration token. */
async function tokenFor(projectId: string, given?: string): Promise<string | null> {
  if (given) return given
  const integration = await prisma.gitIntegration.findUnique({ where: { projectId }, select: { tokenCipher: true } })
  return integration?.tokenCipher ? open(integration.tokenCipher) : null
}

export async function testConnection(projectId: string, url: string, token?: string, fetchImpl?: typeof fetch): Promise<ConnectionResult> {
  const location = parseRepoUrl(url)
  if (!location) return { ok: false, error: "リポジトリの URL を認識できません（社内 GitLab の https URL を入れてください）。" }
  const usable = await tokenFor(projectId, token)
  if (!usable) return { ok: false, error: "アクセストークンが設定されていません。" }
  try {
    const client = createGitLabClient({ apiBase: location.apiBase, token: usable, fetchImpl })
    const p = await client.getProject(location.repoPath)
    // Seeing the project is not enough: a Guest sees it but cannot read code or merge requests.
    const level = accessLevelOf(p)
    if ((level !== null && level < REPORTER_ACCESS_LEVEL) || !(await client.canReadRepository(p.id))) {
      return { ok: false, error: level !== null && level < REPORTER_ACCESS_LEVEL ? `${FORBIDDEN_MESSAGE}（現在のロール: ${roleName(level)}）` : FORBIDDEN_MESSAGE }
    }
    return { ok: true, repository: { path: p.path_with_namespace, webUrl: p.web_url, defaultBranch: p.default_branch, externalId: p.id } }
  } catch (err) {
    return { ok: false, error: err instanceof GitLabError ? syncErrorMessage(err) : "接続テストに失敗しました" }
  }
}

/** GitLab role names as GitLab's Japanese UI shows them. */
function roleName(level: number): string {
  if (level >= 50) return "オーナー"
  if (level >= 40) return "メンテナー"
  if (level >= 30) return "デベロッパー"
  if (level >= 20) return "レポーター"
  if (level >= 10) return "ゲスト"
  return "なし"
}

export async function addRepository(projectId: string, input: z.infer<typeof addRepositorySchema>, actor: Actor, fetchImpl?: typeof fetch): Promise<GitRepositoryDto> {
  await assertProject(projectId)
  const location = parseRepoUrl(input.url)
  if (!location) throw new ValidationError("リポジトリの URL を認識できません（社内 GitLab の https URL を入れてください）。")
  const count = await prisma.gitRepository.count({ where: { projectId } })
  if (count >= MAX_REPOSITORIES) throw new ValidationError(`リポジトリは 1 プロジェクト ${MAX_REPOSITORIES} 個までです。`)
  const duplicate = await prisma.gitRepository.findFirst({ where: { projectId, apiBase: location.apiBase, repoPath: location.repoPath }, select: { id: true } })
  if (duplicate) throw new ValidationError("このリポジトリはすでに登録されています。")
  // Refuse to save a repository the token cannot see: the sync would only fail later.
  const test = await testConnection(projectId, input.url, input.token, fetchImpl)
  if (!test.ok || !test.repository) throw new ValidationError(test.error ?? "接続テストに失敗しました")
  const row = await prisma.gitRepository.create({
    data: {
      projectId,
      name: input.name,
      ...location,
      externalId: test.repository.externalId,
      sortOrder: count,
      ...(input.token ? { tokenCipher: seal(input.token), tokenHint: secretHint(input.token) } : {}),
    },
  })
  await logActivity(prisma, { projectId, entityType: "project", entityId: projectId, action: "update", actor, diff: { changes: { "git.repository": { from: null, to: `${input.name} (${location.repoPath})` } } } })
  return toRepoDto(row)
}

export async function updateRepository(projectId: string, repositoryId: string, input: z.infer<typeof updateRepositorySchema>): Promise<GitRepositoryDto> {
  const repo = await prisma.gitRepository.findFirst({ where: { id: repositoryId, projectId } })
  if (!repo) throw new NotFoundError("Repository not found")
  const row = await prisma.gitRepository.update({
    where: { id: repositoryId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.token === undefined ? {} : input.token === null ? { tokenCipher: null, tokenHint: null } : { tokenCipher: seal(input.token), tokenHint: secretHint(input.token) }),
      // A new token deserves a fresh attempt.
      ...(input.token !== undefined ? { lastError: null, lastErrorAt: null } : {}),
    },
  })
  return toRepoDto(row)
}

/** Removes the repository and its links (cascade). */
export async function removeRepository(projectId: string, repositoryId: string, actor: Actor): Promise<void> {
  const repo = await prisma.gitRepository.findFirst({ where: { id: repositoryId, projectId }, select: { id: true, name: true, repoPath: true } })
  if (!repo) throw new NotFoundError("Repository not found")
  await prisma.gitRepository.delete({ where: { id: repositoryId } })
  await logActivity(prisma, { projectId, entityType: "project", entityId: projectId, action: "update", actor, diff: { changes: { "git.repository": { from: `${repo.name} (${repo.repoPath})`, to: null } } } })
}

// ---------------------------------------------------------------- read models

export interface GitLinkDto {
  id: string
  kind: string
  ref: string
  title: string
  url: string
  state: string | null
  pipeline: string | null
  author: string | null
  sourceBranch: string | null
  occurredAt: string
  mergedAt: string | null
  repository: { id: string; name: string }
}

type LinkRow = Awaited<ReturnType<typeof findLinks>>[number]

function findLinks(where: { projectId: string; backlogItemId?: string | { in: string[] } }, take: number) {
  return prisma.gitLink.findMany({
    where,
    orderBy: { occurredAt: "desc" },
    take,
    include: { repository: { select: { id: true, name: true } }, backlogItem: { select: { id: true, displayId: true, initiative: true, userStory: true } } },
  })
}

function toLinkDto(l: LinkRow): GitLinkDto {
  return {
    id: l.id,
    kind: l.kind,
    ref: l.ref,
    title: l.title,
    url: l.url,
    state: l.state,
    pipeline: l.pipeline,
    author: l.author,
    sourceBranch: l.sourceBranch,
    occurredAt: l.occurredAt.toISOString(),
    mergedAt: l.mergedAt?.toISOString() ?? null,
    repository: l.repository,
  }
}

export interface PbiGitPanelDto {
  enabled: boolean
  pbiKey?: string
  branchSuggestion?: string
  hasRepositories?: boolean
  links?: GitLinkDto[]
}

/** The PBI detail's 開発 panel. `enabled: false` → the UI shows nothing. */
export async function getPbiGitPanel(projectId: string, backlogItemId: string): Promise<PbiGitPanelDto> {
  if (!(await isGitEnabled(projectId))) return { enabled: false }
  const pbi = await prisma.productBacklogItem.findFirst({
    where: { id: backlogItemId, projectId, deletedAt: null },
    select: { displayId: true, initiative: true, epic: true },
  })
  if (!pbi) throw new NotFoundError("PBI not found")
  const [links, repoCount] = await Promise.all([findLinks({ projectId, backlogItemId }, 100), prisma.gitRepository.count({ where: { projectId } })])
  return {
    enabled: true,
    pbiKey: pbiKey(pbi.displayId),
    branchSuggestion: suggestBranchName(pbi.displayId, pbi.initiative ?? pbi.epic),
    hasRepositories: repoCount > 0,
    links: links.map(toLinkDto),
  }
}

/** Card badge of one PBI: open / merged MR counts and the worst pipeline of its open MRs. */
export interface PbiGitSummary {
  openMrs: number
  mergedMrs: number
  branches: number
  /** failed > running > pending > success over open MRs (else the latest merged MR's). */
  pipeline: string | null
}

const PIPELINE_RANK: Record<string, number> = { failed: 4, running: 3, pending: 2, created: 2, waiting_for_resource: 2, preparing: 2, success: 1 }

export function summarize(links: ReadonlyArray<Pick<GitLinkDto, "kind" | "state" | "pipeline" | "occurredAt">>): PbiGitSummary {
  const mrs = links.filter((l) => l.kind === "mr")
  const open = mrs.filter((l) => l.state === "opened" || l.state === "locked")
  const merged = mrs.filter((l) => l.state === "merged").sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
  const pool = open.length > 0 ? open : merged.slice(0, 1)
  const pipeline = pool.map((l) => l.pipeline).filter((p): p is string => !!p).sort((a, b) => (PIPELINE_RANK[b] ?? 0) - (PIPELINE_RANK[a] ?? 0))[0] ?? null
  return { openMrs: open.length, mergedMrs: merged.length, branches: links.filter((l) => l.kind === "branch").length, pipeline }
}

/** Badges for many PBIs at once (sprint board / backlog). Only PBIs with links appear. */
export async function getGitSummaries(projectId: string, backlogItemIds: readonly string[]): Promise<{ enabled: boolean; summaries: Record<string, PbiGitSummary> }> {
  if (!(await isGitEnabled(projectId))) return { enabled: false, summaries: {} }
  const ids = [...new Set(backlogItemIds)].slice(0, 500)
  if (ids.length === 0) return { enabled: true, summaries: {} }
  const rows = await prisma.gitLink.findMany({
    where: { projectId, backlogItemId: { in: ids }, kind: { in: ["mr", "branch"] } },
    select: { backlogItemId: true, kind: true, state: true, pipeline: true, occurredAt: true },
  })
  const grouped = new Map<string, Array<Pick<GitLinkDto, "kind" | "state" | "pipeline" | "occurredAt">>>()
  for (const r of rows) {
    grouped.set(r.backlogItemId, [...(grouped.get(r.backlogItemId) ?? []), { kind: r.kind, state: r.state, pipeline: r.pipeline, occurredAt: r.occurredAt.toISOString() }])
  }
  return { enabled: true, summaries: Object.fromEntries([...grouped].map(([id, links]) => [id, summarize(links)])) }
}

export interface GitOverviewDto {
  enabled: boolean
  repositories: GitRepositoryDto[]
  /** Latest activity across repositories, with the PBI it belongs to. */
  recent: Array<GitLinkDto & { pbi: { id: string; displayId: number; title: string } }>
  pollIntervalSec: number
}

/** The sidebar "開発（Git）" page. */
export async function getGitOverview(projectId: string): Promise<GitOverviewDto> {
  const settings = await getGitSettings(projectId)
  if (!settings.enabled) return { enabled: false, repositories: [], recent: [], pollIntervalSec: settings.pollIntervalSec }
  const links = await findLinks({ projectId }, 60)
  return {
    enabled: true,
    repositories: settings.repositories,
    recent: links.map((l) => ({
      ...toLinkDto(l),
      pbi: { id: l.backlogItem.id, displayId: l.backlogItem.displayId, title: l.backlogItem.initiative || l.backlogItem.userStory?.slice(0, 80) || pbiKey(l.backlogItem.displayId) },
    })),
    pollIntervalSec: settings.pollIntervalSec,
  }
}
