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
} from "@/services/dev-work/dev-work.schemas"
import { claimWork, declareScope, heartbeatClaim, linkMergeRequest, listClaims, postProgress, releaseClaim } from "@/services/dev-work/dev-work.service"
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

/** Open claims of the project (read); session ids only on the viewer's own claims. */
export async function listClaimsOp(projectId: string, query: unknown, viewerId: string) {
  const parsed = listClaimsQuerySchema.parse(query)
  const filter = {
    ...parsed,
    ...(parsed.pbi !== undefined ? { pbi: await maskPbiRef(projectId, parsed.pbi) } : {}),
    ...(parsed.taskId !== undefined ? { taskId: await maskTaskId(parsed.taskId) } : {}),
  }
  const result = await listClaims(projectId, filter, viewerId)
  return { ...result, data: await withoutConfidentialItems(result.data, (claim) => claim.pbi.id) }
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
