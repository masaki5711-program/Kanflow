import { updateSprintOp } from "../../../../_lib/v1-handlers"
import { v1ProjectWrite } from "../../../../_lib/v1-write"

/** PATCH /api/v1/projects/:projectId/sprints/:sprintId — goal, dates, status, review, retrospective (`sprint:write`; PO / SM). */
export const PATCH = v1ProjectWrite<{ projectId: string; sprintId: string }>("sprint.manage", 200, updateSprintOp)
