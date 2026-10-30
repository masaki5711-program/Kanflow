import { linkMergeRequestOp } from "../../../../_lib/v1-dev-handlers"
import { v1ProjectWrite } from "../../../../_lib/v1-write"

/**
 * POST /api/v1/projects/:projectId/dev/mr-links `{ pbi, url, title? }` (`dev:write`; members) — link a merge
 * request of a repository registered in the project's Git integration. 201 linked / 200 already linked.
 */
export const POST = v1ProjectWrite<{ projectId: string }>("dev.write", 201, linkMergeRequestOp, { idempotent: true })
