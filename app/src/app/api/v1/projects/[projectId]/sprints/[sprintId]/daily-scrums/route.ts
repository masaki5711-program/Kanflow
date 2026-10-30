import { createDailyScrumOp } from "../../../../../_lib/v1-handlers"
import { v1ProjectWrite } from "../../../../../_lib/v1-write"

/** POST /api/v1/projects/:projectId/sprints/:sprintId/daily-scrums — a daily scrum note (`daily:write`; members). Idempotency-Key honoured. */
export const POST = v1ProjectWrite<{ projectId: string; sprintId: string }>("dailyScrum.write", 201, createDailyScrumOp, { idempotent: true })
