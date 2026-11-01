import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import type { ApiPrincipal } from "@/services/api-tokens/api-token-auth"
import { FEEDBACK_NOTICE } from "@/services/feedback/feedback.dto"
import { FAILURE_TEXT_MAX, FEEDBACK_SOURCES, lessonScope, LESSON_TEXT_MAX } from "@/services/feedback/feedback.schemas"
import { devBranch, devSessionId } from "@/services/dev-work/dev-work.schemas"
import { reportFailureOp, reportResolutionOp, searchLessonsOp } from "@/app/api/v1/_lib/v1-feedback-handlers"
import { DATA_NOTICE, definedOnly, guard, mcpAccountWrite, toolOk } from "./tool-kit"

/**
 * Feedback-loop tools of the Kanflow MCP server (W11; docs/mcp.md "Feedback tools"): report_failure and
 * report_resolution (scope dev:write), search_lessons (scope read). Same operations as /api/v1/feedback/*
 * (v1-feedback-handlers) through the same write path. An AI session cannot confirm, retire or systemize a
 * lesson: that is a human decision on the Lessons screen.
 */

const id = z.string().min(1).max(191)
const idempotencyKeyArg = z
  .string()
  .regex(/^[\x21-\x7e]{1,200}$/)
  .optional()
  .describe("Optional. Same key = same report (kept 24 h). Without a key an identical call within 2 minutes is a retry (replayed: true).")

const READ = { readOnlyHint: true, openWorldHint: false } as const
const REPORT = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const

const describe = (text: string) => `${text}\n\n${FEEDBACK_NOTICE}\n\n${DATA_NOTICE}`

export function registerFeedbackTools(server: McpServer, principal: ApiPrincipal): void {
  server.registerTool(
    "report_failure",
    {
      description: describe(
        "Report a failed command (build, test, lint, deploy, git …) of your work (scope dev:write; team members). Send the error output as `text` — the server redacts secrets, tokens, e-mail addresses, IPs, host names and home paths, " +
          "but never paste credentials on purpose; if something credential-like remains the report is refused (FEEDBACK_REDACTION_FAILED) and nothing is stored. " +
          "Give `sessionRef` (your session id) so that report_resolution can find this failure. " +
          "The answer lists up to 3 `lessons`: failures like this one that a maintainer already analysed (symptom, cause, fix, verify). Try the fix; run a `verify` command only if the user wants it. " +
          "An identical report of yours within a minute is folded into the first (`collapsed: true`). At most FEEDBACK_REPORT_RATE_LIMIT_PER_MIN (default 60) reports per token per minute (RATE_LIMITED).",
      ),
      inputSchema: {
        tool: z.string().min(1).max(100).describe('The failing tool or command, e.g. "cargo test", "npm run lint", "ci:build".'),
        text: z.string().min(1).max(FAILURE_TEXT_MAX).describe("The error output (the first and the last lines are the most useful; at most 4 KB of it is stored)."),
        errorCode: z.string().max(64).optional().describe("A registered error code if the output has one (FG-…, E0308, ENOENT …)."),
        projectId: id.optional().describe("The Kanflow project the work belongs to; omit outside a project."),
        sessionRef: devSessionId.optional().describe("Your session id (the same one you give claim_work)."),
        branch: devBranch.optional(),
        techs: z.array(z.string().max(40)).max(10).optional().describe('Technologies involved, lower case (e.g. ["rust", "postgres"]); lessons scoped to them are returned.'),
        source: z.enum(FEEDBACK_SOURCES).optional().describe('Default "agent"; CI jobs use "ci".'),
        idempotencyKey: idempotencyKeyArg,
      },
      annotations: REPORT,
    },
    ({ idempotencyKey, ...args }) =>
      guard("report_failure", async () => {
        const body = definedOnly(args)
        return mcpAccountWrite(principal, {
          tool: "report_failure",
          projectId: args.projectId,
          action: "dev.write",
          body,
          params: {},
          op: reportFailureOp,
          idempotent: { key: idempotencyKey },
          ownBudget: true,
        })
      }),
  )

  server.registerTool(
    "report_resolution",
    {
      description: describe(
        "Report how you fixed the failure you reported with report_failure (scope dev:write). It is attached to your latest unresolved failure of this `sessionRef` (last 24 h) and becomes a DRAFT lesson " +
          "(or counts as another fix of an existing lesson). Drafts are shown to nobody but maintainers until one confirms them. " +
          "Say what changed (`diffSummary`: the cause and the change, a few sentences, no secrets) and the command that proved the fix (`verifiedCommand`). FEEDBACK_NO_FAILURE: there is no unresolved failure for this session.",
      ),
      inputSchema: {
        sessionRef: devSessionId.describe("The sessionRef you gave report_failure."),
        diffSummary: z.string().min(1).max(LESSON_TEXT_MAX).describe("What was wrong and what you changed."),
        verifiedCommand: z.string().min(1).max(1000).optional().describe('The command that showed the fix works, e.g. "cargo test -p forge-auth".'),
        cause: z.string().min(1).max(LESSON_TEXT_MAX).optional(),
        scope: lessonScope.optional().describe('"global", "tech:<name>" or "project:<id>". Default: the failure\'s project, or global.'),
        evidence: z.array(z.string().min(1).max(500)).max(10).optional().describe("Links: MR, commit, incident."),
        projectId: id.optional(),
        failureEventId: id.optional().describe("The failure's id from report_failure, when you know it."),
        idempotencyKey: idempotencyKeyArg,
      },
      annotations: REPORT,
    },
    ({ idempotencyKey, ...args }) =>
      guard("report_resolution", async () =>
        mcpAccountWrite(principal, {
          tool: "report_resolution",
          projectId: args.projectId,
          action: "dev.write",
          body: definedOnly(args),
          params: {},
          op: reportResolutionOp,
          idempotent: { key: idempotencyKey },
          ownBudget: true,
        }),
      ),
  )

  server.registerTool(
    "search_lessons",
    {
      description: describe(
        "Search the lessons maintainers confirmed (scope read): by words in the symptom / cause / fix, by error code, by technology or project. Only confirmed or systemized, non-confidential lessons in the token owner's scope are returned (never drafts). " +
          "Search before you start on something that has bitten the team before (a flaky tool, a build step, a deploy).",
      ),
      inputSchema: {
        q: z.string().min(1).max(200).optional().describe("Words to look for."),
        errorCode: z.string().min(1).max(64).optional(),
        tech: z.string().min(1).max(40).optional().describe('A technology name such as "rust", "nextjs", "postgres".'),
        projectId: id.optional(),
        signature: z.string().length(64).optional().describe("A failure signature from report_failure's answer."),
        limit: z.number().int().min(1).max(50).optional(),
      },
      annotations: READ,
    },
    (args) => guard("search_lessons", async () => toolOk(await searchLessonsOp(principal, definedOnly(args)))),
  )
}
