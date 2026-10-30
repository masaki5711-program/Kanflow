import { can } from "@/lib/authz"
import {
  claimWorkSchema,
  heartbeatClaimSchema,
  listClaimsQuerySchema,
  mrLinkSchema,
  progressCommentSchema,
} from "@/services/dev-work/dev-work.schemas"
import { claimWork, heartbeatClaim, linkMergeRequest, listClaims, postProgress, releaseClaim } from "@/services/dev-work/dev-work.service"
import type { V1WriteInput } from "./v1-handlers"
import { V1Reply } from "./v1-route"

/**
 * Developer operations (scope write:dev, action "dev.write"; docs/api-v1.md
 * "Development") shared by the /api/v1/projects/:projectId/dev/* routes and
 * the matching MCP tools. Authorization is the caller's (runV1Write).
 */

/**
 * Claim a PBI / task: 201 new claim, 200 the caller's claim refreshed, 409 TASK_CLAIMED
 * (`holders`) when another user / session holds it; `takenOver` = claims ended by `takeover`.
 */
export async function claimWorkOp({ projectId, body, serviceActor }: V1WriteInput) {
  const result = await claimWork(projectId, claimWorkSchema.parse(body), serviceActor)
  return new V1Reply({ data: result.claim, created: result.created, takenOver: result.takenOver }, result.created ? 201 : 200)
}

/** Heartbeat of the owner (optionally a new branch). */
export async function heartbeatClaimOp({ projectId, params, body, serviceActor }: V1WriteInput<{ claimId: string }>) {
  const result = await heartbeatClaim(projectId, params.claimId, heartbeatClaimSchema.parse(body), serviceActor)
  return { data: result.claim }
}

/** Release (owner only; releasing again is a no-op). */
export async function releaseClaimOp({ projectId, params, serviceActor }: V1WriteInput<{ claimId: string }>) {
  return { data: (await releaseClaim(projectId, params.claimId, serviceActor)).claim }
}

/** Active claims of the project (read). */
export async function listClaimsOp(projectId: string, query: unknown) {
  return listClaims(projectId, listClaimsQuerySchema.parse(query))
}

/** A progress comment on a PBI / sprint task as the token user (comment row carries via). */
export async function postProgressOp({ projectId, body, serviceActor, actor }: V1WriteInput) {
  return { data: await postProgress(projectId, progressCommentSchema.parse(body), serviceActor, can(actor, "comment.moderate")) }
}

/** Link an MR of a registered repository to a PBI: 201 linked now, 200 already linked. */
export async function linkMergeRequestOp({ projectId, body, serviceActor }: V1WriteInput) {
  const result = await linkMergeRequest(projectId, mrLinkSchema.parse(body), serviceActor)
  return new V1Reply({ data: result.link, created: result.created }, result.created ? 201 : 200)
}
