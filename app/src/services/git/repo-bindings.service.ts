import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { open } from "@/lib/secret-box"
import { stationAllowedHosts } from "@/lib/git/repo-url"
import { getRateLimiter, type RateLimiter } from "@/lib/rate-limit"
import {
  GitStationError,
  isBindableKanflowProjectId,
  isEmployeeNumber,
  MAX_REPOSITORY_QUERY,
  type BindingIntent,
  type BindingWriteOutcome,
  type GitStationClient,
  type GitStationRepositoryBinding,
} from "@/lib/git/gitstation-client"
import { NotFoundError, StatusError, ValidationError } from "@/services/_shared"
import { assertClaimedBySamePerson, BINDING_INTENTS, type AttemptSubject, claimAttempt, discardClaim, employeeNumberOf, finishAfterWrite, finishAttempt, lockAttempt, openAttempt, statusError as err } from "./act-as-attempts"
import { defaultGitStationClientFactory, type GitStationClientFactory } from "./gitstation-source"

/**
 * Bind / unbind GitStation repositories to this Kanflow project from the project's settings (plan 11 §5.7 X3,
 * plan 03 §7.1; GitStation ADR-0016 Amendment X3, ADR-0025 Amendment X3), through the same act-as confirmation as
 * K4's approvals (act-as-attempts):
 *
 *  - search: the repositories the signed-in person may bind (GitStation: Maintainer and above), read with the
 *    service-account token and `Forge-Act-As: employee:<n>` — no assertion (GitStation decides it as the person).
 *  - start: Kanflow stores an attempt bound to the user, the repository, this project and the setting
 *    (`resolves_work_items`: true = a code repository, in one Kanflow project only; false = a shared spec repository)
 *    and returns GitStation's binding confirmation URL; the person presses there.
 *  - complete (確認しました): Kanflow claims the confirmation, checks that it names this user (by employee number),
 *    this project, this repository and this setting, then binds (POST, or PATCH when an existing shared binding
 *    becomes a code one) or unbinds (DELETE) with `Forge-Act-As: user:<sub>` and the assertion.
 *
 * GitStation decides every write again (the person's role, its binding rules: FG-INT-0016). The current bindings
 * are read by the integration's service account itself. Which GitStation: the one host of GITSTATION_ALLOWED_HOSTS,
 * else the one host of the project's GitStation repositories (otherwise Kanflow cannot tell, and says so).
 */

const log = logger.child({ module: "git-repo-bindings" })

export interface RepoBindingDeps {
  clientFactory?: GitStationClientFactory
  now?: () => Date
  random?: (bytes: number) => Buffer
  /** Kanflow's own search throttle (default: the process-wide one, SEARCH_LIMIT_PER_MINUTE per user and project). */
  searchLimiter?: RateLimiter
}

/**
 * Searches one person may make per minute in one project. GitStation allows the integration's service account 30 a
 * minute (FG-WEB-0010) and K4's status reads share that account: one person cannot use them all up.
 */
export const SEARCH_LIMIT_PER_MINUTE = 10
const searchLimiter = (): RateLimiter => getRateLimiter("gitstation-repo-search", { limit: SEARCH_LIMIT_PER_MINUTE, windowMs: 60_000 })

/** One repository bound to this project in GitStation. */
export interface RepoBindingItem {
  bindingId: number
  repositoryId: number
  /** `group/name` (null when GitStation cannot read it). */
  path: string | null
  /** true = code repository (PBI-123 resolves in it), false = shared spec repository. */
  resolvesWorkItems: boolean
  /** Kanflow's repository list already reads it (same GitStation host and path). */
  listed: boolean
  /** https://<GitStation>/<path>: what 開発データの取り込み先に追加 adds (null without a path). */
  url: string | null
}

export type RepoBindingsResult =
  | { supported: false; reason: "off" | "provider" | "config" }
  /** canAct = the signed-in user can be named to GitStation (employee number): bind / unbind are offered. */
  | { supported: true; canAct: boolean; items: RepoBindingItem[] }

export interface BindableRepositoryItem {
  id: number
  path: string
  displayName: string
  /** This project's binding of the repository, if any. */
  binding: { bindingId: number; resolvesWorkItems: boolean } | null
}

export type RepoBindingStartInput =
  | { intent: "binding_set"; repositoryId: number; resolvesWorkItems: boolean }
  | { intent: "binding_remove"; bindingId: number }

export interface StartedRepoBinding {
  attemptId: string
  confirmUrl: string
  expiresAt: string
}

export interface CompletedRepoBinding {
  outcome: BindingWriteOutcome | "removed"
  binding: GitStationRepositoryBinding | null
}

interface Station {
  client: GitStationClient
  /** https://host of GitStation. */
  apiBase: string
  integrationId: string
}

/** GitStation's integration id as its binding confirmation link accepts it (parseBindingLink). */
const INTEGRATION_ID = /^[1-9][0-9]{0,15}$/

/** The https://host of GitStation for this project, or null when Kanflow cannot tell. */
async function stationBase(projectId: string): Promise<string | null> {
  const hosts = stationAllowedHosts()
  if (hosts.length === 1) return `https://${hosts[0]}`
  const repos = await prisma.gitRepository.findMany({ where: { projectId }, select: { apiBase: true } })
  const bases = new Set(
    repos.flatMap((r) => {
      try {
        const url = new URL(r.apiBase)
        return url.protocol === "https:" && hosts.includes(url.hostname.toLowerCase()) ? [`https://${url.hostname.toLowerCase()}`] : []
      } catch {
        return []
      }
    }),
  )
  return bases.size === 1 ? [...bases][0] : null
}

/** The project's GitStation (integration, host, token) for binding, or why there is none. */
async function stationOf(projectId: string, factory: GitStationClientFactory): Promise<{ station: Station; reason: null } | { station: null; reason: "off" | "provider" | "config" }> {
  const integration = await prisma.gitIntegration.findUnique({ where: { projectId } })
  if (!integration?.enabled) return { station: null, reason: "off" }
  if (integration.provider !== "gitstation") return { station: null, reason: "provider" }
  const integrationId = integration.stationIntegrationId?.trim() ?? ""
  const token = integration.tokenCipher ? open(integration.tokenCipher) : null
  const apiBase = await stationBase(projectId)
  if (!INTEGRATION_ID.test(integrationId) || !token || !apiBase || !isBindableKanflowProjectId(projectId)) return { station: null, reason: "config" }
  try {
    return { station: { client: factory({ apiBase, token, integrationId }), apiBase, integrationId }, reason: null }
  } catch (e) {
    // The client refuses a host outside the allow list (it never is: the base comes from it).
    log.warn("gitstation binding client refused", { projectId, error: e instanceof Error ? e.message : String(e) })
    return { station: null, reason: "config" }
  }
}

async function requireStation(projectId: string, factory: GitStationClientFactory): Promise<Station> {
  const { station, reason } = await stationOf(projectId, factory)
  if (!station) throw err(409, reason === "config" ? "GIT_BINDING_CONFIG" : "GIT_BINDING_UNAVAILABLE", "このプロジェクトでは GitStation のリポジトリを結びつけられません", { reason })
  return station
}

async function requireEmployeeNumber(userId: string): Promise<string> {
  const employeeNumber = await employeeNumberOf(userId)
  if (!isEmployeeNumber(employeeNumber)) throw err(409, "GIT_APPROVAL_NO_EMPLOYEE_NUMBER", "社員番号が登録されていません")
  return employeeNumber
}

/**
 * A GitStation refusal as the error the screen explains (ja / en / id by code). Logged once here with GitStation's
 * error code — never the assertion, the state or the employee number.
 */
function toServiceError(e: unknown, context: Record<string, unknown>): Error {
  if (!(e instanceof GitStationError)) return e instanceof Error ? e : new Error(String(e))
  const code = e.detail.errorCode
  log.warn("gitstation binding refused", { ...context, kind: e.kind, status: e.status, errorCode: code })
  if (e.kind === "rate_limited") return err(429, "RATE_LIMITED", "GitStation の回数の上限です", { retryAfterSec: e.detail.retryAfterSec ?? null })
  if (e.kind === "act_as_target_invalid") return err(409, "GIT_APPROVAL_NO_EMPLOYEE_NUMBER", "社員番号を GitStation に渡せません")
  switch (code) {
    case "FG-AUTH-0020":
      return err(409, "GIT_APPROVAL_RETRY", "確認をやり直してください")
    case "FG-INT-0006":
      return err(409, "GIT_APPROVAL_IDENTITY", "この利用者の代わりに操作できません")
    case "FG-AUTH-0003":
    case "FG-REPO-0005":
      // Not Maintainer, or a repository the person cannot see (absent and hidden answer the same).
      return err(403, "GIT_BINDING_NOT_ALLOWED", "このリポジトリを結びつける権限がありません")
    case "FG-INT-0016":
      return err(409, "GIT_BINDING_CONFLICT", "GitStation の結びつけの規則で断られました")
    case "FG-AUTH-0002":
      return err(409, "GIT_BINDING_CONFIG", "連携の設定の問題で結びつけを変更できません")
  }
  if (e.kind === "auth" || e.kind === "host_not_allowed") return err(409, "GIT_BINDING_CONFIG", "連携の設定の問題で結びつけを変更できません")
  if (e.kind === "not_found") return err(404, "NOT_FOUND", "見つかりません")
  return err(502, "UPSTREAM_FAILED", "GitStation に接続できませんでした")
}

/** GitStation's answer, or the error the screen explains. */
async function asked<T>(read: Promise<T>, context: Record<string, unknown>): Promise<T> {
  try {
    return await read
  } catch (e) {
    throw toServiceError(e, context)
  }
}

/**
 * The repositories bound to this project in GitStation (read by the integration's service account), each with
 * whether Kanflow's repository list already reads it. `supported: false` when the project does not read GitStation
 * or Kanflow cannot tell which GitStation.
 */
export async function getRepositoryBindings(projectId: string, userId: string, deps: RepoBindingDeps = {}): Promise<RepoBindingsResult> {
  const { station, reason } = await stationOf(projectId, deps.clientFactory ?? defaultGitStationClientFactory)
  if (!station) return { supported: false, reason }
  const [bindings, repos, employeeNumber] = await Promise.all([
    asked(station.client.repositoryBindings(projectId), { projectId, action: "list" }),
    prisma.gitRepository.findMany({ where: { projectId }, select: { apiBase: true, repoPath: true } }),
    employeeNumberOf(userId),
  ])
  const listed = new Set(repos.map((r) => `${r.apiBase.replace(/\/+$/, "").toLowerCase()}\u0000${r.repoPath.toLowerCase()}`))
  const items = bindings
    .map((b): RepoBindingItem => ({
      bindingId: b.bindingId,
      repositoryId: b.repositoryId,
      path: b.repositoryPath,
      resolvesWorkItems: b.resolvesWorkItems,
      listed: b.repositoryPath !== null && listed.has(`${station.apiBase.toLowerCase()}\u0000${b.repositoryPath.toLowerCase()}`),
      url: b.repositoryPath !== null ? `${station.apiBase}/${b.repositoryPath}` : null,
    }))
    .sort((a, b) => (a.path ?? "").localeCompare(b.path ?? "") || a.bindingId - b.bindingId)
  return { supported: true, canAct: isEmployeeNumber(employeeNumber), items }
}

/**
 * GitStation repositories whose path or name contains `q` that the signed-in person may bind (read as the person;
 * GitStation allows 30 searches a minute per integration, so the screen searches on submit only), each with this
 * project's binding of it.
 */
export async function searchBindableRepositories(projectId: string, userId: string, q: string, deps: RepoBindingDeps = {}): Promise<{ items: BindableRepositoryItem[] }> {
  const text = q.trim()
  if (text.length === 0 || text.length > MAX_REPOSITORY_QUERY) throw new ValidationError(`検索の文字は 1〜${MAX_REPOSITORY_QUERY} 文字で入れてください`)
  const station = await requireStation(projectId, deps.clientFactory ?? defaultGitStationClientFactory)
  const employeeNumber = await requireEmployeeNumber(userId)
  const context = { projectId, action: "search" }
  const throttle = (deps.searchLimiter ?? searchLimiter()).consume(`${userId}\u0000${projectId}`)
  if (!throttle.allowed) {
    log.warn("gitstation repository search throttled", context)
    throw err(429, "RATE_LIMITED", "検索の回数の上限です。少し待ってください", { retryAfterSec: Math.ceil(throttle.status.retryAfterMs / 1000) })
  }
  const found = await asked(station.client.searchRepositoriesAs(text, employeeNumber), context)
  const bound = found.length > 0 ? await asked(station.client.repositoryBindings(projectId), context) : []
  const byRepository = new Map(bound.map((b) => [b.repositoryId, b]))
  return {
    items: found.map((r) => {
      const b = byRepository.get(r.id)
      return { id: r.id, path: r.path, displayName: r.displayName, binding: b ? { bindingId: b.bindingId, resolvesWorkItems: b.resolvesWorkItems } : null }
    }),
  }
}

/**
 * 結びつける / 設定を変える / 解除する: checks the current bindings, stores a new attempt and returns GitStation's
 * binding confirmation URL. A shared spec binding asked as code becomes a change (PATCH) of that binding; the same
 * setting again and code → shared in place are refused here (GitStation would refuse them too).
 */
export async function startRepositoryBinding(projectId: string, userId: string, input: RepoBindingStartInput, deps: RepoBindingDeps = {}): Promise<StartedRepoBinding> {
  const now = (deps.now ?? (() => new Date()))()
  const station = await requireStation(projectId, deps.clientFactory ?? defaultGitStationClientFactory)
  await requireEmployeeNumber(userId)
  const context = { projectId, intent: input.intent }
  const bindings = await asked(station.client.repositoryBindings(projectId), context)
  let subject: Extract<AttemptSubject, { intent: BindingIntent }>
  let resolves: boolean | null = null
  if (input.intent === "binding_set") {
    const existing = bindings.find((b) => b.repositoryId === input.repositoryId)
    if (existing && existing.resolvesWorkItems === input.resolvesWorkItems) throw err(409, "GIT_BINDING_ALREADY", "すでにこの設定で結びついています")
    if (existing && existing.resolvesWorkItems && !input.resolvesWorkItems) throw err(409, "GIT_BINDING_RESOLUTION_FIXED", "コードのリポジトリは共有の仕様に変えられません（解除してから結び直してください）")
    subject = { intent: "binding_set", stationProjectId: input.repositoryId, resolvesWorkItems: input.resolvesWorkItems, bindingId: existing?.bindingId ?? null }
    resolves = input.resolvesWorkItems
  } else {
    const existing = bindings.find((b) => b.bindingId === input.bindingId)
    if (!existing) throw new NotFoundError("Binding not found")
    subject = { intent: "binding_remove", stationProjectId: existing.repositoryId, bindingId: existing.bindingId }
  }
  const { id: attemptId, state, expiresAt } = await openAttempt(projectId, userId, subject, now, deps.random)
  // Exactly the parameters GitStation's parseBindingLink accepts (the setting only for binding_set).
  const query = new URLSearchParams({ intent: input.intent, integration: station.integrationId, kanflow_project_id: projectId })
  if (resolves !== null) query.set("resolves_work_items", String(resolves))
  query.set("state", state)
  const confirmUrl = `${station.apiBase}/-/confirm/projects/${subject.stationProjectId}/integration-bindings?${query.toString()}`
  log.info("gitstation binding started", { ...context, attemptId, stationProjectId: subject.stationProjectId })
  return { attemptId, confirmUrl, expiresAt: expiresAt.toISOString() }
}

/**
 * 確認しました: claim the person's confirmation and bind / unbind. Only the user who started the attempt may complete
 * it; a second press while a claim is in flight is refused (GIT_APPROVAL_BUSY) and a finished attempt is never sent
 * again. Before the person pressed in GitStation the attempt stays open (GIT_APPROVAL_NOT_CONFIRMED).
 */
export async function completeRepositoryBinding(projectId: string, userId: string, attemptId: string, deps: RepoBindingDeps = {}): Promise<CompletedRepoBinding> {
  const now = (deps.now ?? (() => new Date()))()
  const attempt = await lockAttempt(projectId, userId, attemptId, BINDING_INTENTS, now)
  const intent = attempt.intent as BindingIntent
  const repositoryId = attempt.stationProjectId === null ? null : Number(attempt.stationProjectId)
  const bindingId = attempt.bindingId === null ? null : Number(attempt.bindingId)
  const context = { projectId, attemptId: attempt.id, intent, stationProjectId: repositoryId }
  // The CHECK makes a binding intent carry its repository (and an unbind its binding); without them it is not ours.
  if (repositoryId === null || (intent === "binding_remove" && bindingId === null) || (intent === "binding_set" && attempt.resolvesWorkItems === null)) {
    await finishAttempt(attempt.id, "failed", now)
    throw new NotFoundError("Confirmation not found")
  }
  const { claim, value } = await claimAttempt(
    attempt,
    now,
    context,
    async () => {
      const station = await requireStation(projectId, deps.clientFactory ?? defaultGitStationClientFactory)
      const employeeNumber = await employeeNumberOf(userId)
      return { client: station.client, value: { station, employeeNumber } }
    },
    toServiceError,
  )
  const { station, employeeNumber } = value

  // From here the claim's secret is in hand: whatever happens, the attempt is finished (the secret is never stored).
  try {
    const mismatch =
      claim.intent !== intent ? "intent"
        // A binding intent names no merge request.
        : claim.iid !== null || claim.headSha !== null || claim.targetRef !== null ? "intent"
          : claim.kanflowProjectId !== projectId ? "kanflow_project"
            : claim.projectId !== repositoryId ? "repository"
              : claim.resolvesWorkItems !== (intent === "binding_set" ? attempt.resolvesWorkItems : null) ? "setting"
                : null
    if (mismatch) {
      await discardClaim(attempt, mismatch, now, context)
      throw err(409, "GIT_APPROVAL_RETRY", "確認の内容が違います")
    }
    await assertClaimedBySamePerson(attempt, claim, employeeNumber, now, context)
    const as = { userId: claim.sub.userId, assertion: claim.assertion }
    if (intent === "binding_remove") {
      await station.client.removeBindingAs(bindingId as number, as)
      await finishAfterWrite(attempt.id, "removed", now, context)
      log.info("gitstation binding removed", { ...context, bindingId })
      return { outcome: "removed", binding: null }
    }
    const answer = await station.client.setBindingAs({ kanflowProjectId: projectId, repositoryId, resolvesWorkItems: attempt.resolvesWorkItems as boolean, bindingId }, as)
    await finishAfterWrite(attempt.id, answer.outcome, now, context)
    log.info("gitstation binding set", { ...context, outcome: answer.outcome, bindingId: answer.binding.bindingId, resolvesWorkItems: answer.binding.resolvesWorkItems })
    return { outcome: answer.outcome, binding: answer.binding }
  } catch (e) {
    await finishAttempt(attempt.id, "failed", now)
    if (e instanceof StatusError) throw e
    // The binding (or repository) went away since the confirmation (another person unbound it): start again.
    if (e instanceof GitStationError && e.status === 404) {
      toServiceError(e, context)
      throw err(409, "GIT_APPROVAL_RETRY", "結びつけが変わりました。もう一度やり直してください")
    }
    throw toServiceError(e, context)
  }
}
