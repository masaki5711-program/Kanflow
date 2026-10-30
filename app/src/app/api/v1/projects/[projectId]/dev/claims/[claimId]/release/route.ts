import { releaseClaimOp } from "../../../../../../_lib/v1-dev-handlers"
import { v1ProjectWrite } from "../../../../../../_lib/v1-write"

/**
 * POST /api/v1/projects/:projectId/dev/claims/:claimId/release — the claim's user ends it, or a
 * PO / SM / admin ends anyone's (`dev:write` + role with sprint.manage; logged, holder notified). Retry-safe.
 */
export const POST = v1ProjectWrite<{ projectId: string; claimId: string }>("dev.write", 200, releaseClaimOp)
