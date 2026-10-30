import { updateSprintSchema } from "@/services/sprints/sprints.schemas"
import { updateSprint } from "@/services/sprints/sprints.service"
import { v1ProjectWrite } from "../../../../_lib/v1-write"

/** PATCH /api/v1/projects/:projectId/sprints/:sprintId — goal, dates, status, review, retrospective (`sprint:write`; PO / SM). */
export const PATCH = v1ProjectWrite<{ projectId: string; sprintId: string }>(
  "sprint.manage",
  200,
  async ({ projectId, params, body, serviceActor }) => ({
    data: await updateSprint(projectId, params.sprintId, updateSprintSchema.parse(body), serviceActor),
  })
)
