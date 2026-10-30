import { createIceboxItemOp } from "../../../_lib/v1-handlers"
import { v1ProjectWrite } from "../../../_lib/v1-write"

/** POST /api/v1/projects/:projectId/icebox — submit a request to the Icebox (`icebox:write`; members and section managers). Idempotency-Key honoured. */
export const POST = v1ProjectWrite<{ projectId: string }>("icebox.write", 201, createIceboxItemOp, { idempotent: true })
