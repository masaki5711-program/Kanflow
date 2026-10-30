import { addSprintPbisOp } from "../../../../../_lib/v1-handlers"
import { v1ProjectWrite } from "../../../../../_lib/v1-write"

/**
 * POST /api/v1/projects/:projectId/sprints/:sprintId/pbis `{ pbIds }` — add PBIs to the sprint
 * (`sprint:write`; PO / SM). 201 when something was added, 200 when all were already in it.
 */
export const POST = v1ProjectWrite<{ projectId: string; sprintId: string }>("sprint.manage", 201, addSprintPbisOp)
