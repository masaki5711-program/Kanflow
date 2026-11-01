import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import { ValidationError } from "@/services/_shared/errors"
import type { ApiPrincipal } from "@/services/api-tokens/api-token-auth"
import { devBranch, devPbiRef, devSessionId, PROGRESS_ENTITY_TYPES, SCOPE_RAW_ENTRIES_MAX } from "@/services/dev-work/dev-work.schemas"
import { SCOPE_KINDS } from "@/services/dev-work/dev-work.scope"
import { COMMENT_BODY_MAX } from "@/services/comments/comments.schemas"
import {
  claimWorkOp,
  declareScopeOp,
  linkMergeRequestOp,
  listClaimsOp,
  postProgressOp,
  releaseClaimOp,
} from "@/app/api/v1/_lib/v1-dev-handlers"
import { CREATE_NOTE, DATA_NOTICE, definedOnly, guard, mcpWrite, pbiIdIn, pbiScope, projectScope, toolOk } from "./tool-kit"

/**
 * Developer tools of the Kanflow MCP server (K5, scope dev:write; docs/mcp.md
 * "Development tools"): 作業の宣言, 触る範囲 (declare_scope), progress comments, MR links. Same operations
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
          "One active claim per task: if another user or session holds the task (or the whole PBI) you get TASK_CLAIMED with `holders` (user name, branch, claimedAt, lastHeartbeatAt) — stop and tell the user; do not work on it in parallel. " +
          "A stale claim (no heartbeat for the window) never blocks: your claim supersedes it and its user is notified (`superseded`). " +
          "takeover: true ends only YOUR OWN other sessions' active claims on the target (`takenOver`); another user's active claim is never taken over. " +
          "At most DEV_CLAIM_MAX_OPEN_PER_USER (default 20) active claims per project (CLAIM_LIMIT_REACHED). It does not change the task status.",
      ),
      inputSchema: {
        pbi: pbiArg.optional(),
        taskId: id.optional().describe("A sprint task id (from get_sprint_tasks / my_tasks / get_pbi)."),
        sessionId: devSessionId.describe("Your session id (e.g. the Claude Code session id); 1-100 visible ASCII characters."),
        branch: devBranch.optional().describe("The git branch you work on."),
        takeover: z.boolean().optional().describe("End your own other sessions' active claims on the target (never another user's)."),
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
      description: describe(
        "Release your work claim when you stop or finish (scope dev:write; any session of the claim's user). A Product Owner / Scrum Master may release anyone's claim (the holder is notified) — only on the user's explicit request. Releasing twice is harmless.",
      ),
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
    "declare_scope",
    {
      description: describe(
        "Declare which files / modules your claim will touch (触る範囲; scope dev:write; only the claim's own user). Call it right after claim_work, once you have a plan, and again when the plan changes: it REPLACES the whole set ([] clears it). " +
          'Entries: { kind: "path", value: a file or directory relative to the repository root, POSIX "/" (e.g. "app/src/services/dev-work", "docs/api-v1.md") } or { kind: "module", value: a crate / package / directory name (e.g. "forge-auth") }. No absolute paths, no "..", no glob patterns other than a trailing "/**"; at most 200 distinct entries (SCOPE_INVALID / SCOPE_TOO_LARGE). ' +
          "The answer lists `overlaps`: other people's (or your other sessions') active claims whose scope shares files with yours — user name, branch, PBI / task, the shared paths. Overlaps are a warning, not a refusal: when there are any, STOP and show them to the user (who, which files), and revisit the plan with the user (split the files, change the order, or coordinate) before you edit the shared files. Do not proceed silently. " +
          "The Kanflow board and PBI page show the same warning, and the Git sync flags merge requests that change files outside the declared scope.",
      ),
      inputSchema: {
        claimId: id.describe("Your claim id (from claim_work)."),
        projectId: id.describe("The claim's projectId."),
        scope: z
          .array(z.object({ kind: z.enum(SCOPE_KINDS), value: z.string().min(1).max(1000) }))
          .max(SCOPE_RAW_ENTRIES_MAX)
          .describe("The whole set of files / modules you will touch."),
      },
      annotations: IDEMPOTENT_WRITE,
    },
    ({ claimId, projectId, scope }) =>
      guard("declare_scope", async () => {
        const target = await projectScope(principal, projectId)
        return mcpWrite(principal, { tool: "declare_scope", scope: target, action: "dev.write", body: { scope }, params: { claimId }, op: declareScopeOp })
      }),
  )

  server.registerTool(
    "list_claims",
    {
      description: describe("Open work claims of a project (who works on which PBI / task, session, branch, lastHeartbeat, staleAt, the declared scope), newest heartbeat first; stale ones (no heartbeat for the window — they no longer block) are flagged stale: true. Optionally one PBI or task. Check it before claiming or creating tasks."),
      inputSchema: { projectId: id, pbi: pbiArg.optional(), taskId: id.optional() },
      annotations: READ,
    },
    ({ projectId, pbi, taskId }) =>
      guard("list_claims", async () => {
        const scope = await projectScope(principal, projectId)
        return toolOk(await listClaimsOp(scope.projectId, definedOnly({ pbi, taskId }), principal.userId))
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
          "(https://<host>/<group>/<repo>/-/merge_requests/<number>); other URLs are refused (MR_URL_INVALID / MR_REPOSITORY_NOT_REGISTERED). Linking the same MR again answers the existing link (created: false). The link shows the MR's synced title and state (\"!<number>\" and no state until the next Git sync reads it) and is display only: it never completes tasks or marks a release ready — only MRs whose title / branch name the PBI do.",
      ),
      inputSchema: {
        pbi: pbiArg,
        url: z.string().min(1).max(1000).describe("The merge request URL."),
        projectId: optionalProjectId,
      },
      annotations: IDEMPOTENT_WRITE,
    },
    ({ pbi, url, projectId }) =>
      guard("link_merge_request", async () => {
        const scope = await pbiScope(principal, projectId, pbi)
        const body = { pbi: await pbiIdIn(scope.projectId, pbi), url }
        return mcpWrite(principal, { tool: "link_merge_request", scope, action: "dev.write", body, params: {}, op: linkMergeRequestOp })
      }),
  )
}
