import { heartbeatClaimOp } from "../../../../../_lib/v1-dev-handlers"
import { v1ProjectWrite } from "../../../../../_lib/v1-write"

/** PATCH /api/v1/projects/:projectId/dev/claims/:claimId `{ branch? }` — heartbeat of the claim's owner (`write:dev`). */
export const PATCH = v1ProjectWrite<{ projectId: string; claimId: string }>("dev.write", 200, heartbeatClaimOp)
