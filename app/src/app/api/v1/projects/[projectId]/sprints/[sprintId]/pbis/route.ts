import { addSprintPbisSchema } from "@/services/sprint-backlog/sprint-backlog.schemas"
import { addPbisToSprint } from "@/services/sprint-backlog/sprint-backlog.service"
import { V1Reply } from "../../../../../_lib/v1-route"
import { v1ProjectWrite } from "../../../../../_lib/v1-write"

/**
 * POST /api/v1/projects/:projectId/sprints/:sprintId/pbis `{ pbIds }` — add PBIs to the sprint
 * (`sprint:write`; PO / SM). 201 when something was added, 200 when all were already in it.
 */
export const POST = v1ProjectWrite<{ projectId: string; sprintId: string }>(
  "sprint.manage",
  201,
  async ({ projectId, params, body, serviceActor }) => {
    const { pbIds } = addSprintPbisSchema.parse(body)
    const result = await addPbisToSprint(projectId, params.sprintId, pbIds, serviceActor)
    return new V1Reply({ data: result }, result.added === 0 ? 200 : 201)
  }
)
