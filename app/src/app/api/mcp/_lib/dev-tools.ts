import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import { ValidationError } from "@/services/_shared/errors"
import type { ApiPrincipal } from "@/services/api-tokens/api-token-auth"
import { devBranch, devPbiRef, devSessionId, PROGRESS_ENTITY_TYPES } from "@/services/dev-work/dev-work.schemas"
import { COMMENT_BODY_MAX } from "@/services/comments/comments.schemas"
import {
  claimWorkOp,
  linkMergeRequestOp,
  listClaimsOp,
  postProgressOp,
  releaseClaimOp,
} from "@/app/api/v1/_lib/v1-dev-handlers"
import { CREATE_NOTE, DATA_NOTICE, definedOnly, guard, mcpWrite, pbiIdIn, pbiScope, projectScope, toolOk } from "./tool-kit"

/**
 * Developer tools of the Kanflow MCP server (K5, scope dev:write; docs/mcp.md
 * "Development tools"): 作業の宣言, progress comments, MR links. Same operations
 * as /api/v1/projects/:projectId/dev/* (v1-dev-handlers) through the same
 * write path (runV1Write: scope dev:write ∩ role, write budget, via "mcp").
 * Nothing here moves a task or PBI status: that stays a human decision.
 */

const id = z.string().min(1).max(191)
const optionalProjectId = id.optional().describe("Kanflow project id. Optional when the PBI / task is given by its internal id; required for PBI numbers.")
const pbiArg = devPbiRef.describe('PBI: its internal id, its number "12" or "PBI-12" (numbers need projectId).')
const idempotencyKeyArg = z
  .string()
  .regex(/^[\x21-\x7e]{1,200}$/)
  .optional()
  .describe("Optional. Same key = same post (kept 24 h). Without a key, an identical call within 2 minutes is treated as a retry (replayed: true).")

const READ = { readOnlyHint: true, openWorldHint: false } as const
/** Claims and links are naturally idempotent (refresh / already linked), release too. */
const IDEMPOTENT_WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const
const CREATE = IDEMPOTENT_WRITE

const describe = (text: string) => `${text}\n\n${DATA_NOTICE}`

export function registerDevTools(server: McpServer, principal: ApiPrincipal): void {
  /** Project of a PBI or a sprint task given by the caller. */
  async function targetScope(projectId: string | undefined, target: { pbi?: string; taskId?: string }) {
    if (target.taskId !== undefined) return projectScope(principal, projectId, { kind: "task", id: target.taskId })
    return pbiScope(principal, projectId, target.pbi ?? "")
  }

  server.registerTool(
    "claim_work",
    {
      description: describe(
        "Declare that you (the token user) are working on a PBI or one sprint task, from this session and branch (作業の宣言; scope dev:write, team members). " +
          "Give exactly one of pbi / taskId. Call it again with the same sessionId at least every couple of hours as a heartbeat (a claim without heartbeat goes stale after DEV_CLAIM_STALE_HOURS, default 4 h). " +
          "One active claim per task: if another user or session holds the task (or the whole PBI) you get TASK_CLAIMED with `holders` (name, session, branch, claimedAt, lastHeartbeatAt) — stop and tell the user; do not work on it in parallel. " +
          "takeover: true ends the other claim only when it is stale or your own other session (otherwise still TASK_CLAIMED); the previous holder is notified. It does not change the task status.",
      ),
      inputSchema: {
        pbi: pbiArg.optional(),
        taskId: id.optional().describe("A sprint task id (from get_sprint_tasks / my_tasks / get_pbi)."),
        sessionId: devSessionId.describe("Your session id (e.g. the Claude Code session id); 1-100 visible ASCII characters."),
        branch: devBranch.optional().describe("The git branch you work on."),
        takeover: z.boolean().optional().describe("End a stale claim or your own other session's claim on the target (never another user's active claim)."),
        projectId: optionalProjectId,
      },
      annotations: IDEMPOTENT_WRITE,
    },
    ({ pbi, taskId, sessionId, branch, takeover, projectId }) =>
      guard("claim_work", async () => {
        if ((pbi === undefined) === (taskId === undefined)) throw new ValidationError("Give exactly one of pbi and taskId", {}, "VALIDATION")
        const scope = await targetScope(projectId, { pbi, taskId })
        const body = definedOnly({ pbi: pbi === undefined ? undefined : await pbiIdIn(scope.projectId, pbi), taskId, sessionId, branch, takeover })
        return mcpWrite(principal, { tool: "claim_work", scope, action: "dev.write", body, params: {}, op: claimWorkOp })
      }),
  )

  server.registerTool(
    "release_claim",
    {
      description: describe("Release your work claim when you stop or finish (scope dev:write; only the claim's owner). Releasing twice is harmless."),
      inputSchema: { claimId: id.describe("The claim id from claim_work / list_claims."), projectId: id.describe("The claim's projectId.") },
      annotations: IDEMPOTENT_WRITE,
    },
    ({ claimId, projectId }) =>
      guard("release_claim", async () => {
        const scope = await projectScope(principal, projectId)
        return mcpWrite(principal, { tool: "release_claim", scope, action: "dev.write", body: {}, params: { claimId }, op: releaseClaimOp })
      }),
  )

  server.registerTool(
    "list_claims",
    {
      description: describe("Open work claims of a project (who works on which PBI / task, session, branch, lastHeartbeat, staleAt), newest heartbeat first; stale ones (no heartbeat for the window — they no longer block) are flagged stale: true. Optionally one PBI or task. Check it before claiming or creating tasks."),
      inputSchema: { projectId: id, pbi: pbiArg.optional(), taskId: id.optional() },
      annotations: READ,
    },
    ({ projectId, pbi, taskId }) =>
      guard("list_claims", async () => {
        const scope = await projectScope(principal, projectId)
        return toolOk(await listClaimsOp(scope.projectId, definedOnly({ pbi, taskId })))
      }),
  )

  server.registerTool(
    "post_progress",
    {
      description: describe(
        `Post a progress comment on a PBI or a sprint task as the token user (scope dev:write; team members). It appears in the item's comment thread marked "via MCP (AI)". Keep it short and factual (what is done, what is next, blockers).\n\n${CREATE_NOTE}`,
      ),
      inputSchema: {
        entityType: z.enum(PROGRESS_ENTITY_TYPES),
        entityId: id.describe('PBI (id, "12" or "PBI-12" with projectId) or sprint task id.'),
        body: z.string().min(1).max(COMMENT_BODY_MAX),
        projectId: optionalProjectId,
        idempotencyKey: idempotencyKeyArg,
      },
      annotations: CREATE,
    },
    ({ entityType, entityId, body, projectId, idempotencyKey }) =>
      guard("post_progress", async () => {
        const scope = await targetScope(projectId, entityType === "pbi" ? { pbi: entityId } : { taskId: entityId })
        const target = entityType === "pbi" ? await pbiIdIn(scope.projectId, entityId) : entityId
        return mcpWrite(principal, {
          tool: "post_progress",
          scope,
          action: "dev.write",
          body: { entityType, entityId: target, body },
          params: {},
          op: postProgressOp,
          idempotent: { key: idempotencyKey },
        })
      }),
  )

  server.registerTool(
    "link_merge_request",
    {
      description: describe(
        "Link a merge request to a PBI (scope dev:write; team members). The URL must be a merge request of a repository registered in the project's Git integration " +
          "(https://<host>/<group>/<repo>/-/merge_requests/<number>); other URLs are refused (MR_URL_INVALID / MR_REPOSITORY_NOT_REGISTERED). Linking the same MR again answers the existing link (created: false).",
      ),
      inputSchema: {
        pbi: pbiArg,
        url: z.string().min(1).max(1000).describe("The merge request URL."),
        title: z.string().min(1).max(500).optional().describe('Shown until the next Git sync reads the MR (default "!<number>").'),
        projectId: optionalProjectId,
      },
      annotations: IDEMPOTENT_WRITE,
    },
    ({ pbi, url, title, projectId }) =>
      guard("link_merge_request", async () => {
        const scope = await pbiScope(principal, projectId, pbi)
        const body = definedOnly({ pbi: await pbiIdIn(scope.projectId, pbi), url, title })
        return mcpWrite(principal, { tool: "link_merge_request", scope, action: "dev.write", body, params: {}, op: linkMergeRequestOp })
      }),
  )
}
