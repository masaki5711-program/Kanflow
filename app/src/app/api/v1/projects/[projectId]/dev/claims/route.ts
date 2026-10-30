import { claimWorkOp, listClaimsOp } from "../../../../_lib/v1-dev-handlers"
import { v1ProjectRoute } from "../../../../_lib/v1-route"
import { v1ProjectWrite } from "../../../../_lib/v1-write"

/** GET /api/v1/projects/:projectId/dev/claims?pbi=&taskId= — active work claims (作業の宣言), newest heartbeat first. */
export const GET = v1ProjectRoute<{ projectId: string }>(async ({ projectId, query }) => listClaimsOp(projectId, query))

/**
 * POST /api/v1/projects/:projectId/dev/claims `{ pbi | taskId, sessionId, branch? }` (`dev:write`; members).
 * 201 new claim / 200 own claim refreshed; overlapping claims of others come back in `conflicts`.
 */
export const POST = v1ProjectWrite<{ projectId: string }>("dev.write", 201, claimWorkOp, { idempotent: true })
