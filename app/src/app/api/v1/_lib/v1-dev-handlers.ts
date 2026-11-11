import { can } from "@/lib/authz"
import { parseMergeRequestUrl } from "@/lib/git/repo-url"
import { maskClaimId, maskCommentEntityId, maskPbiRef, maskTaskId, withoutConfidentialItems } from "@/services/api-v1/api-v1.confidential"
import {
  claimWorkSchema,
  declareScopeSchema,
  heartbeatClaimSchema,
  listClaimsQuerySchema,
  mrLinkSchema,
  progressCommentSchema,
  startWorkSchema,
} from "@/services/dev-work/dev-work.schemas"
import {
  claimMrWarnings,
  claimWork,
  declareScope,
  heartbeatClaim,
  linkMergeRequest,
  listClaims,
  normalizedScopeOrThrow,
  postProgress,
  readMrContext,
  releaseClaim,
  type ScopeOverlapDto,
} from "@/services/dev-work/dev-work.service"
import { findTask } from "@/services/dev-work/dev-work.repository"
import { pbiDevelopment, startCommands } from "@/services/dev-work/dev-work.start"
import { getPbi } from "@/services/api-v1/api-v1.service"
import { defaultDb } from "@/services/_shared/db"
import { NotFoundError } from "@/services/_shared/errors"
import type { V1WriteInput } from "./v1-handlers"
import { V1Reply } from "./v1-route"

/**
 * Developer operations (scope dev:write, action "dev.write"; docs/api-v1.md
 * "Development") shared by the /api/v1/projects/:projectId/dev/* routes and
 * the matching MCP tools. Authorization is the caller's (runV1Write).
 *
 * Confidential PBIs (D-5, api-v1.confidential.ts): anything that names one (a PBI, a task under it,
 * a claim on it) is handed to the service as an id that cannot exist, and lists drop them.
 */

/**
 * Claim a PBI / task: 201 new claim, 200 the caller's claim refreshed, 409 TASK_CLAIMED
 * (`holders`) when another user / session holds it; `takenOver` = the caller's other sessions
 * ended by `takeover`, `superseded` = stale claims the new claim replaced.
 */
export async function claimWorkOp({ projectId, body, serviceActor }: V1WriteInput) {
  const parsed = claimWorkSchema.parse(body)
  const input = {
    ...parsed,
    ...(parsed.pbi !== undefined ? { pbi: await maskPbiRef(projectId, parsed.pbi) } : {}),
    ...(parsed.taskId !== undefined ? { taskId: await maskTaskId(parsed.taskId) } : {}),
  }
  const result = await claimWork(projectId, input, serviceActor)
  return new V1Reply(
    { data: result.claim, created: result.created, takenOver: result.takenOver, superseded: result.superseded },
    result.created ? 201 : 200,
  )
}

/** Heartbeat of the owner (optionally a new branch). */
export async function heartbeatClaimOp({ projectId, params, body, serviceActor }: V1WriteInput<{ claimId: string }>) {
  const result = await heartbeatClaim(projectId, await maskClaimId(projectId, params.claimId), heartbeatClaimSchema.parse(body), serviceActor)
  return { data: result.claim }
}

/**
 * Release: the claim's user, or a PO / SM / admin for anyone's claim (`sprint.manage`,
 * the role that runs the sprint's work; logged and the holder notified). Releasing again is a no-op.
 */
export async function releaseClaimOp({ projectId, params, serviceActor, actor }: V1WriteInput<{ claimId: string }>) {
  const claimId = await maskClaimId(projectId, params.claimId)
  return { data: (await releaseClaim(projectId, claimId, serviceActor, { canModerate: can(actor, "sprint.manage") })).claim }
}

/**
 * 触る範囲 (W4): replace the claim's declared files / modules — the claim's user only. Answers
 * `{ data: { scope, overlaps, overlapsTruncated? } }`: the other active claims whose scope
 * overlaps (who, branch, shared paths; never a session id). A warning, never a refusal.
 */
export async function declareScopeOp({ projectId, params, body, serviceActor }: V1WriteInput<{ claimId: string }>) {
  const result = await declareScope(projectId, await maskClaimId(projectId, params.claimId), declareScopeSchema.parse(body), serviceActor)
  // Other people's claims on confidential PBIs are not shown as overlaps.
  return { data: { ...result, overlaps: await withoutConfidentialItems(result.overlaps, (o) => o.pbi.id) } }
}

/**
 * N7 start_work (MCP; docs/integration/gitstation-operations-plan.md §3): claim the PBI / task (409 TASK_CLAIMED
 * stops here, nothing else is written), declare the scope when given (checked BEFORE the claim, so a bad scope
 * claims nothing), then answer what the session needs to start: the claim, the overlap warnings from the three
 * sources (declared scopes, other MRs' changed files, predicted conflicts), the PBI with its acceptance criteria
 * (ids PBI-12/AC-2), the development copy (branch suggestion, repositories, the PBI's MRs as last synced) and the
 * next commands as data. Kanflow calls no GitStation API and creates no branch or MR.
 */
export async function startWorkOp({ projectId, body, serviceActor }: V1WriteInput) {
  const parsed = startWorkSchema.parse(body)
  if (parsed.scope !== undefined) normalizedScopeOrThrow({ scope: parsed.scope })
  const target = {
    ...(parsed.pbi !== undefined ? { pbi: await maskPbiRef(projectId, parsed.pbi) } : {}),
    ...(parsed.taskId !== undefined ? { taskId: await maskTaskId(parsed.taskId) } : {}),
  }
  // The PBI first (a confidential or missing one answers 404 before anything is written).
  let pbiRef = target.pbi
  if (pbiRef === undefined) {
    const task = await findTask(defaultDb, projectId, target.taskId ?? "")
    if (!task) throw new NotFoundError("Task not found")
    pbiRef = task.pbItemId
  }
  const pbi = (await getPbi(projectId, pbiRef)).data
  const development = await pbiDevelopment(projectId, pbi)
  // The branch is recorded on the claim: the one given, else the one the session is told to create.
  const branch = parsed.branch ?? development.branchSuggestion
  const claimed = await claimWork(projectId, { ...target, sessionId: parsed.sessionId, branch, ...(parsed.takeover !== undefined ? { takeover: parsed.takeover } : {}) }, serviceActor)
  let claim = claimed.claim
  let overlaps: { overlaps: ScopeOverlapDto[]; overlapsTruncated?: true } = { overlaps: [] }
  let mergeRequestWarnings
  if (parsed.scope !== undefined) {
    const declared = await declareScope(projectId, claim.id, { scope: parsed.scope }, serviceActor)
    claim = { ...claim, scope: declared.scope }
    // Other people's claims on confidential PBIs are not shown as overlaps.
    overlaps = { overlaps: await withoutConfidentialItems(declared.overlaps, (o) => o.pbi.id), ...(declared.overlapsTruncated ? { overlapsTruncated: true as const } : {}) }
    mergeRequestWarnings = declared.mergeRequests
  } else {
    mergeRequestWarnings = claimMrWarnings({ backlogItemId: claim.pbi.id, branch, scope: claim.scope }, await readMrContext(projectId), true)
  }
  const criteria = pbi.acceptanceCriteriaItems.map((c) => c.id)
  const hasOpenMr = development.mergeRequests.some((m) => m.state === "opened" || m.state === "locked")
  return new V1Reply(
    {
      data: {
        claim,
        created: claimed.created,
        takenOver: claimed.takenOver,
        superseded: claimed.superseded,
        ...overlaps,
        mergeRequestWarnings,
        pbi,
        development: { ...development, branch },
        nextCommands: startCommands({ provider: development.provider, branch, pbiKey: development.pbiKey, criteria, sessionId: parsed.sessionId, hasOpenMr }),
      },
    },
    claimed.created ? 201 : 200,
  )
}

/** Open claims of the project (read); session ids only on the viewer's own claims. */
export async function listClaimsOp(projectId: string, query: unknown, viewerId: string) {
  const parsed = listClaimsQuerySchema.parse(query)
  const filter = {
    ...parsed,
    ...(parsed.pbi !== undefined ? { pbi: await maskPbiRef(projectId, parsed.pbi) } : {}),
    ...(parsed.taskId !== undefined ? { taskId: await maskTaskId(parsed.taskId) } : {}),
  }
  // Confidential claims are excluded in the query (before the page limit), not after it.
  return listClaims(projectId, filter, viewerId, new Date(), { hideConfidential: true })
}

/** A progress comment on a PBI / sprint task as the token user (comment row carries via). */
export async function postProgressOp({ projectId, body, serviceActor, actor }: V1WriteInput) {
  const input = progressCommentSchema.parse(body)
  const entityId = await maskCommentEntityId(projectId, input.entityType, input.entityId)
  return { data: await postProgress(projectId, { ...input, entityId }, serviceActor, can(actor, "comment.moderate")) }
}

/** Link an MR of a registered repository to a PBI: 201 linked now, 200 already linked. */
export async function linkMergeRequestOp({ projectId, body, serviceActor }: V1WriteInput) {
  const parsed = mrLinkSchema.parse(body)
  // The service checks the URL before it looks the PBI up: keep that order, so a bad URL answers the same either way.
  const input = parseMergeRequestUrl(parsed.url) ? { ...parsed, pbi: await maskPbiRef(projectId, parsed.pbi) } : parsed
  const result = await linkMergeRequest(projectId, input, serviceActor)
  return new V1Reply({ data: result.link, created: result.created }, result.created ? 201 : 200)
}
