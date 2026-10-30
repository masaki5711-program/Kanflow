import { createDailyScrumSchema } from "@/services/daily-scrums/daily-scrums.schemas"
import { createNote } from "@/services/daily-scrums/daily-scrums.service"
import { v1ProjectWrite } from "../../../../../_lib/v1-write"

/** POST /api/v1/projects/:projectId/sprints/:sprintId/daily-scrums — a daily scrum note (`daily:write`; members). Idempotency-Key honoured. */
export const POST = v1ProjectWrite<{ projectId: string; sprintId: string }>(
  "dailyScrum.write",
  201,
  async ({ projectId, params, body, serviceActor }) => ({
    data: await createNote(projectId, params.sprintId, createDailyScrumSchema.parse(body), serviceActor),
  }),
  { idempotent: true }
)
