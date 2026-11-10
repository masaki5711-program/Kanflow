import { z } from "zod"
import type { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { open, seal, secretHint } from "@/lib/secret-box"
import { accessLevelOf, createGitLabClient, GitLabError, REPORTER_ACCESS_LEVEL } from "@/lib/git/gitlab-client"
import { allowedHosts, parseRepoUrl, stationAllowedHosts } from "@/lib/git/repo-url"
import { pbiKey, suggestBranchName } from "@/lib/git/pbi-keys"
import { ConflictError, NotFoundError, ValidationError } from "@/services/_shared/errors"
import { logActivity, type ActivityChanges } from "@/services/_shared/activity"
import type { Actor } from "@/services/_shared/actor"
import { ACCEPTANCE_NO_FAILURE, acceptanceCheckInEffect } from "./acceptance-check-rules"
import { devSourceFor, type DevClients } from "./dev-source"
import { assertOneSource, DEFAULT_GIT_PROVIDER, parseGitProvider, type GitProvider } from "./git-provider"
import { RESYNC_DAYS } from "./git-sync-cursors"
import { FORBIDDEN_MESSAGE, syncErrorMessage } from "./gitlab-source"
import { restartFeedOfRepository } from "./gitstation-feed-sync"
import { KNOWLEDGE_UNSUPPORTED_MESSAGE } from "./repo-index"
import { aiPathFilterField, knowledgePatch, toKnowledgeDto, type RepositoryKnowledgeDto } from "./repo-knowledge.service"

/**
 * GitLab integration settings and read models. The access token is write-only:
 * responses carry `hasToken` and the last four characters, never the token.
 */

/** Repositories per project (a product with front end / API / edge / tools fits easily). */
export const MAX_REPOSITORIES = 20
const MAX_TOKEN_LENGTH = 200

const tokenField = z.string().trim().min(8).max(MAX_TOKEN_LENGTH)
/** GitStation integration ids are opaque (plan 02 §5.1); only a safe alphabet is stored and sent in the URL path (encoded). */
const stationIntegrationIdField = z
  .string()
  .trim()
  // First character alphanumeric: never "." / ".." (a path segment once encoded into the URL).
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/, "連携 ID は英数字で始まり、英数字と _ . : - の 64 文字までです。")

export const gitSettingsSchema = z
  .object({
    enabled: z.boolean().optional(),
    /** string = replace, null = remove, absent = keep. */
    token: tokenField.nullable().optional(),
    autoCompleteOnMerge: z.boolean().optional(),
    /** provider "gitstation": report the check `kanflow/acceptance` on open merge requests (acceptance-check.service). */
    stationAcceptanceCheck: z.boolean().optional(),
    /** Where the project's development data is read from (one per project: "gitlab" or "gitstation" — git-provider). */
    provider: z.string().trim().min(1).max(32).optional(),
    /** provider "gitstation": GitStation's integration id (opaque). string = set, null = remove, absent = keep. */
    stationIntegrationId: stationIntegrationIdField.nullable().optional(),
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
    /** "AI の参照資料として使う" and its folder filter (repo-knowledge.service). */
    aiKnowledge: z.boolean().optional(),
    aiPathFilter: aiPathFilterField.optional(),
  })
  .strict()

export const testConnectionSchema = z.object({ url: z.string().trim().min(1).max(1000), token: tokenField.optional() }).strict()

export interface GitRepositoryDto extends RepositoryKnowledgeDto {
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
  /** Where the project reads its development data from ("gitlab" | "gitstation"). */
  provider: string
  /** GitStation's integration id (provider "gitstation"), else null. */
  stationIntegrationId: string | null
  hasToken: boolean
  tokenHint: string | null
  autoCompleteOnMerge: boolean
  /** The check `kanflow/acceptance` is reported to GitStation (in effect only while the provider is "gitstation"). */
  stationAcceptanceCheck: boolean
  /** The latest report that failed and has not succeeded since (stored Japanese text, translated in the UI); null = none, or the check is not in effect. */
  acceptanceCheckError: { message: string; at: string | null } | null
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
    ...toKnowledgeDto(r),
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
  const acceptanceError = acceptanceCheckInEffect(integration)
    ? await prisma.gitAcceptanceReport.findFirst({
        where: { repository: { projectId }, lastError: { not: null } },
        orderBy: { lastErrorAt: "desc" },
        select: { lastError: true, lastErrorAt: true },
      })
    : null
  return {
    enabled: integration?.enabled ?? false,
    provider: integration?.provider ?? DEFAULT_GIT_PROVIDER,
    stationIntegrationId: integration?.stationIntegrationId ?? null,
    hasToken: !!integration?.tokenCipher,
    tokenHint: integration?.tokenHint ?? null,
    autoCompleteOnMerge: integration?.autoCompleteOnMerge ?? false,
    stationAcceptanceCheck: integration?.stationAcceptanceCheck ?? false,
    acceptanceCheckError: acceptanceError?.lastError ? { message: acceptanceError.lastError, at: acceptanceError.lastErrorAt?.toISOString() ?? null } : null,
    repositories: repos.map(toRepoDto),
    pollIntervalSec: pollIntervalSec(),
  }
}

export async function updateGitSettings(projectId: string, input: GitSettingsInput, actor: Actor): Promise<GitSettingsDto> {
  await assertProject(projectId)
  const provider = input.provider === undefined ? undefined : parseGitProvider(input.provider)
  // A GitStation token may only go to a GitStation host: with none allowed, the switch is refused.
  if (provider === "gitstation" && stationAllowedHosts().length === 0) {
    throw new ValidationError("GitStation のホストが許可されていません（サーバーの GITSTATION_ALLOWED_HOSTS）。管理者に設定を依頼してください。", undefined, "GITSTATION_HOST_NOT_ALLOWED")
  }
  const tokenPatch =
    input.token === undefined ? {} : input.token === null ? { tokenCipher: null, tokenHint: null } : { tokenCipher: seal(input.token), tokenHint: secretHint(input.token) }
  const patch = {
    ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    ...(input.autoCompleteOnMerge !== undefined ? { autoCompleteOnMerge: input.autoCompleteOnMerge } : {}),
    ...(input.stationAcceptanceCheck !== undefined ? { stationAcceptanceCheck: input.stationAcceptanceCheck } : {}),
    ...(provider !== undefined ? { provider } : {}),
    ...(input.stationIntegrationId !== undefined ? { stationIntegrationId: input.stationIntegrationId } : {}),
    ...tokenPatch,
  }
  // Read, check and write under the project lock: a repository added meanwhile cannot slip past the one-source rule.
  const before = await prisma.$transaction(async (tx) => {
    await lockProject(tx, projectId)
    const row = await tx.gitIntegration.findUnique({
      where: { projectId },
      select: { enabled: true, autoCompleteOnMerge: true, stationAcceptanceCheck: true, provider: true, stationIntegrationId: true },
    })
    if (provider !== undefined && row && row.provider !== provider) assertOneSource(row.provider, provider, await tx.gitRepository.count({ where: { projectId } }))
    const after = await tx.gitIntegration.upsert({
      where: { projectId },
      create: { projectId, ...patch },
      update: patch,
      select: { enabled: true, provider: true, stationAcceptanceCheck: true },
    })
    // The check stops being in effect (switched off, the integration disabled, another source): what was reported is
    // forgotten, so the next time it is in effect every open merge request is reported afresh. The check runs already
    // in GitStation stay there — Kanflow cannot take a report back. The reporter writes its rows under a lock on this
    // git_integration row (acceptance-check.service save), so a tick still running cannot bring a row back.
    if (acceptanceCheckInEffect(row) && !acceptanceCheckInEffect(after)) await tx.gitAcceptanceReport.deleteMany({ where: { repository: { projectId } } })
    // A new token or integration ID deserves a fresh attempt: the failures stored with the old one — and the wait they
    // put on their repositories — go, so the next tick reports again instead of after the wait.
    else if (input.token !== undefined || (input.stationIntegrationId !== undefined && input.stationIntegrationId !== (row?.stationIntegrationId ?? null)))
      await tx.gitAcceptanceReport.updateMany({ where: { repository: { projectId }, lastError: { not: null } }, data: ACCEPTANCE_NO_FAILURE })
    return row
  })
  const changes: ActivityChanges = {}
  if (input.enabled !== undefined && input.enabled !== (before?.enabled ?? false)) changes["git.enabled"] = { from: before?.enabled ?? false, to: input.enabled }
  if (input.autoCompleteOnMerge !== undefined && input.autoCompleteOnMerge !== (before?.autoCompleteOnMerge ?? false))
    changes["git.autoCompleteOnMerge"] = { from: before?.autoCompleteOnMerge ?? false, to: input.autoCompleteOnMerge }
  if (input.stationAcceptanceCheck !== undefined && input.stationAcceptanceCheck !== (before?.stationAcceptanceCheck ?? false))
    changes["git.stationAcceptanceCheck"] = { from: before?.stationAcceptanceCheck ?? false, to: input.stationAcceptanceCheck }
  if (provider !== undefined && provider !== (before?.provider ?? DEFAULT_GIT_PROVIDER)) changes["git.provider"] = { from: before?.provider ?? DEFAULT_GIT_PROVIDER, to: provider }
  if (input.stationIntegrationId !== undefined && input.stationIntegrationId !== (before?.stationIntegrationId ?? null))
    changes["git.stationIntegrationId"] = { from: before?.stationIntegrationId ?? null, to: input.stationIntegrationId }
  // The token itself never goes to the log; only that it changed.
  if (input.token !== undefined) changes["git.token"] = { from: "•••", to: input.token === null ? null : "•••" }
  if (Object.keys(changes).length > 0) {
    await logActivity(prisma, { projectId, entityType: "project", entityId: projectId, action: "update", actor, diff: { changes } })
  }
  return getGitSettings(projectId)
}

type Tx = Prisma.TransactionClient

/**
 * Serializes the project's Git settings changes and repository additions
 * (row lock on the project, held until the transaction ends): the one-source
 * rule (git-provider) is checked and written as one step, so a provider switch
 * and a new repository cannot both pass their checks concurrently.
 */
async function lockProject(tx: Tx, projectId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id" = ${projectId} FOR UPDATE`
}

/** The project's source, which must be one Kanflow can read (no integration row yet = the default). */
async function projectProvider(db: Pick<Tx, "gitIntegration">, projectId: string): Promise<GitProvider> {
  const integration = await db.gitIntegration.findUnique({ where: { projectId }, select: { provider: true } })
  return parseGitProvider(integration?.provider ?? DEFAULT_GIT_PROVIDER)
}

export interface ConnectionResult {
  ok: boolean
  /** Source-side facts on success (GitStation: its project id; the path is resolved again on every sync). */
  repository?: { path: string; webUrl: string; defaultBranch: string | null; externalId: number | null }
  /** Japanese explanation on failure. */
  error?: string
}

/** Hosts a provider's repositories may live on (GIT_ALLOWED_HOSTS / GITSTATION_ALLOWED_HOSTS). */
function hostsFor(provider: GitProvider): string[] {
  return provider === "gitstation" ? stationAllowedHosts() : allowedHosts()
}

/** Token to use for a repository URL test: the given one, else the integration token. */
async function tokenFor(projectId: string, given?: string): Promise<string | null> {
  if (given) return given
  const integration = await prisma.gitIntegration.findUnique({ where: { projectId }, select: { tokenCipher: true } })
  return integration?.tokenCipher ? open(integration.tokenCipher) : null
}

export async function testConnection(projectId: string, url: string, token?: string, fetchImpl?: typeof fetch, clients: DevClients = {}): Promise<ConnectionResult> {
  const integration = await prisma.gitIntegration.findUnique({ where: { projectId }, select: { provider: true, stationIntegrationId: true } })
  const provider = parseGitProvider(integration?.provider ?? DEFAULT_GIT_PROVIDER)
  // Each source has its own host list: a GitStation token never goes to a GitLab host, nor the reverse.
  const location = parseRepoUrl(url, hostsFor(provider))
  if (!location) return { ok: false, error: "リポジトリの URL を認識できません（許可されたホストの https URL を入れてください）。" }
  const usable = await tokenFor(projectId, token)
  if (!usable) return { ok: false, error: "アクセストークンが設定されていません。" }
  if (provider !== "gitlab") return testThroughSource(projectId, provider, location, usable, integration?.stationIntegrationId ?? null, clients)
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

/**
 * Connection test through the project's DevSource (GitStation): `locate` proves the integration's
 * service account can see the repository and that GitStation binds it to this Kanflow project.
 */
async function testThroughSource(
  projectId: string,
  provider: GitProvider,
  location: { apiBase: string; repoPath: string; webUrl: string },
  token: string,
  stationIntegrationId: string | null,
  clients: DevClients,
): Promise<ConnectionResult> {
  const source = devSourceFor(provider).connect({ repositoryId: "", projectId, apiBase: location.apiBase, repoPath: location.repoPath, externalId: null, token, stationIntegrationId }, clients)
  try {
    const externalId = await source.locate()
    return { ok: true, repository: { path: location.repoPath, webUrl: location.webUrl, defaultBranch: null, externalId } }
  } catch (err) {
    return { ok: false, error: source.describeError(err).message }
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

export async function addRepository(projectId: string, input: z.infer<typeof addRepositorySchema>, actor: Actor, fetchImpl?: typeof fetch, clients: DevClients = {}): Promise<GitRepositoryDto> {
  await assertProject(projectId)
  // Only a provider Kanflow can read (400 otherwise); the connection test below goes through the project's source.
  const provider = await projectProvider(prisma, projectId)
  const location = parseRepoUrl(input.url, hostsFor(provider))
  if (!location) throw new ValidationError("リポジトリの URL を認識できません（許可されたホストの https URL を入れてください）。")
  await assertRoomFor(prisma, projectId, location)
  // Refuse to save a repository the token cannot see: the sync would only fail later.
  const test = await testConnection(projectId, input.url, input.token, fetchImpl, clients)
  if (!test.ok || !test.repository) throw new ValidationError(test.error ?? "接続テストに失敗しました")
  const externalId = test.repository.externalId
  // Checked again under the project lock (the connection test ran outside it): provider, limit, duplicate.
  const row = await prisma.$transaction(async (tx) => {
    await lockProject(tx, projectId)
    // The provider must not have changed since the URL was checked against its hosts.
    if ((await projectProvider(tx, projectId)) !== provider) throw new ConflictError("取り込み元が変更されました。もう一度追加してください。", undefined, "GIT_SOURCE_LOCKED")
    const count = await assertRoomFor(tx, projectId, location)
    return tx.gitRepository.create({
      data: {
        projectId,
        name: input.name,
        ...location,
        externalId,
        sortOrder: count,
        ...(input.token ? { tokenCipher: seal(input.token), tokenHint: secretHint(input.token) } : {}),
      },
    })
  })
  await logActivity(prisma, { projectId, entityType: "project", entityId: projectId, action: "update", actor, diff: { changes: { "git.repository": { from: null, to: `${input.name} (${location.repoPath})` } } } })
  return toRepoDto(row)
}

/** Limit and duplicate check of a new repository; returns the current count (its sort order). */
async function assertRoomFor(db: Pick<Tx, "gitRepository">, projectId: string, location: { apiBase: string; repoPath: string }): Promise<number> {
  const count = await db.gitRepository.count({ where: { projectId } })
  if (count >= MAX_REPOSITORIES) throw new ValidationError(`リポジトリは 1 プロジェクト ${MAX_REPOSITORIES} 個までです。`)
  const duplicate = await db.gitRepository.findFirst({ where: { projectId, apiBase: location.apiBase, repoPath: location.repoPath }, select: { id: true } })
  if (duplicate) throw new ValidationError("このリポジトリはすでに登録されています。")
  return count
}

/** `reindex`: the caller should start an index pass (knowledge switched on / filter changed). */
export async function updateRepository(
  projectId: string,
  repositoryId: string,
  input: z.infer<typeof updateRepositorySchema>,
  actor?: Actor,
): Promise<GitRepositoryDto & { reindex: boolean }> {
  const repo = await prisma.gitRepository.findFirst({ where: { id: repositoryId, projectId } })
  if (!repo) throw new NotFoundError("Repository not found")
  if (input.aiKnowledge === true) {
    // Only a source that can read files can be AI knowledge (GitStation: not yet).
    const integration = await prisma.gitIntegration.findUnique({ where: { projectId }, select: { provider: true } })
    if (!devSourceFor(integration?.provider ?? DEFAULT_GIT_PROVIDER).readsRepositoryFiles) throw new ValidationError(KNOWLEDGE_UNSUPPORTED_MESSAGE, undefined, "GIT_KNOWLEDGE_UNSUPPORTED")
  }
  const knowledge = knowledgePatch(repo, input)
  const update = prisma.gitRepository.update({
    where: { id: repositoryId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.token === undefined ? {} : input.token === null ? { tokenCipher: null, tokenHint: null } : { tokenCipher: seal(input.token), tokenHint: secretHint(input.token) }),
      // A new token deserves a fresh attempt.
      ...(input.token !== undefined ? { lastError: null, lastErrorAt: null, indexError: null, indexErrorAt: null } : {}),
      ...knowledge.data,
    },
  })
  // Switched off: the passages go in the same transaction, so the AI can no longer read them.
  const row = knowledge.purge ? (await prisma.$transaction([prisma.repoChunk.deleteMany({ where: { repositoryId } }), update]))[1] : await update
  // The acceptance check too: what it stored as failed for this repository (and the wait) goes with the old token.
  if (input.token !== undefined) await prisma.gitAcceptanceReport.updateMany({ where: { repositoryId, lastError: { not: null } }, data: ACCEPTANCE_NO_FAILURE })
  if (Object.keys(knowledge.changes).length > 0 && actor) {
    await logActivity(prisma, { projectId, entityType: "project", entityId: projectId, action: "update", actor, diff: { changes: knowledge.changes } })
  }
  return { ...toRepoDto(row), reindex: knowledge.reindex }
}

/** Removes the repository and its links (cascade). */
export async function removeRepository(projectId: string, repositoryId: string, actor: Actor): Promise<void> {
  const repo = await prisma.gitRepository.findFirst({ where: { id: repositoryId, projectId }, select: { id: true, name: true, repoPath: true } })
  if (!repo) throw new NotFoundError("Repository not found")
  await prisma.gitRepository.delete({ where: { id: repositoryId } })
  await logActivity(prisma, { projectId, entityType: "project", entityId: projectId, action: "update", actor, diff: { changes: { "git.repository": { from: `${repo.name} (${repo.repoPath})`, to: null } } } })
}

/** True when the repository belongs to the project (checked before a rate limit is keyed by it). */
export async function isProjectRepository(projectId: string, repositoryId: string): Promise<boolean> {
  return !!(await prisma.gitRepository.findFirst({ where: { id: repositoryId, projectId }, select: { id: true } }))
}

/**
 * 過去分を再同期: the next syncs re-read the last 90 days (merge requests from
 * 90 days back, commits by a look-back pass), bounded per sync and resumed, e.g.
 * after the PBI key rules changed. Links are written idempotently, so what is
 * already linked is only re-read. The caller rate-limits and may sync at once.
 */
export async function resyncRepository(projectId: string, repositoryId: string, actor: Actor, now = new Date()): Promise<void> {
  const repo = await prisma.gitRepository.findFirst({ where: { id: repositoryId, projectId } })
  if (!repo) throw new NotFoundError("Repository not found")
  // The project's source restarts its own (opaque) cursor; no integration row yet = the default source.
  const integration = await prisma.gitIntegration.findUnique({ where: { projectId }, select: { provider: true } })
  const provider = parseGitProvider(integration?.provider ?? DEFAULT_GIT_PROVIDER)
  const { cursors } = devSourceFor(provider)
  // GitStation: the cursor belongs to the integration's feed (shared by its repositories), which
  // restarts — in one transaction with the repository's generation bump.
  if (provider === "gitstation") {
    await prisma.$transaction(async (tx) => {
      if (!(await restartFeedOfRepository(repositoryId, tx))) {
        throw new ValidationError("GitStation の連携 ID かアクセストークンが未設定、または読み取れないため、再同期できません。チーム設定を確かめてください。", undefined, "GIT_RESYNC_UNAVAILABLE")
      }
      await tx.gitRepository.update({ where: { id: repositoryId }, data: { stationRereadAt: now, syncGeneration: repo.syncGeneration === null ? 1 : { increment: 1 } } })
    })
  } else
  await prisma.gitRepository.update({
    where: { id: repositoryId },
    data: {
      ...cursors.restart(repo, now),
      // A sync running right now started with the old generation and will not write its cursors back.
      syncGeneration: repo.syncGeneration === null ? 1 : { increment: 1 },
    },
  })
  await logActivity(prisma, {
    projectId,
    entityType: "project",
    entityId: projectId,
    action: "update",
    actor,
    diff: { changes: { "git.resync": { from: null, to: `${repo.name} (${RESYNC_DAYS}d)` } } },
  })
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
  /** Branches: when the branch disappeared from GitLab (shown as 削除済み); null = live. */
  goneAt: string | null
  /** MR linked by a developer (dev:write, …/dev/mr-links) rather than found by the sync. */
  declared: boolean
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
    goneAt: l.goneAt?.toISOString() ?? null,
    declared: l.declaredAt !== null,
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
    // A deleted branch stays on the PBI panel (削除済み) but no longer counts on the card badge.
    where: { projectId, backlogItemId: { in: ids }, kind: { in: ["mr", "branch"] }, goneAt: null },
    select: { backlogItemId: true, kind: true, state: true, pipeline: true, occurredAt: true },
  })
  const grouped = new Map<string, Array<Pick<GitLinkDto, "kind" | "state" | "pipeline" | "occurredAt">>>()
  for (const r of rows) {
    grouped.set(r.backlogItemId, [...(grouped.get(r.backlogItemId) ?? []), { kind: r.kind, state: r.state, pipeline: r.pipeline, occurredAt: r.occurredAt.toISOString() }])
  }
  return { enabled: true, summaries: Object.fromEntries([...grouped].map(([id, links]) => [id, summarize(links)])) }
}

/** Most MRs counted for the sidebar pill (the pill shows 99+ beyond this anyway). */
const NEW_MR_CAP = 100

/**
 * Open merge requests that came into the project after `since` (the viewer's
 * last visit to the Git page; null = never visited, so every open one counts).
 * "Came in" = first linked to a PBI (createdAt), not GitLab's own updated date.
 * One MR linked to several PBIs counts once.
 */
export async function getNewMrCount(projectId: string, since: Date | null): Promise<{ enabled: boolean; count: number }> {
  if (!(await isGitEnabled(projectId))) return { enabled: false, count: 0 }
  const rows = await prisma.gitLink.findMany({
    where: { projectId, kind: "mr", state: { in: ["opened", "locked"] }, ...(since && { createdAt: { gt: since } }) },
    select: { repositoryId: true, ref: true },
    distinct: ["repositoryId", "ref"],
    take: NEW_MR_CAP,
  })
  return { enabled: true, count: rows.length }
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
