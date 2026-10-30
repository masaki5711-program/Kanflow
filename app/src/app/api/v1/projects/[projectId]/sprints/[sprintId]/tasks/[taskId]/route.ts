import { updateTaskSchema } from "@/services/sprint-backlog/sprint-backlog.schemas"
import { updateTask } from "@/services/sprint-backlog/sprint-backlog.service"
import { v1ProjectWrite } from "../../../../../../_lib/v1-write"

/**
 * PATCH /api/v1/projects/:projectId/sprints/:sprintId/tasks/:taskId — status, hours, assignees, name
 * (`task:write`; members). Send `version` to detect conflicts (409).
 */
export const PATCH = v1ProjectWrite<{ projectId: string; sprintId: string; taskId: string }>(
  "task.write",
  200,
  async ({ projectId, params, body, serviceActor }) => ({
    data: await updateTask(projectId, params.sprintId, params.taskId, updateTaskSchema.parse(body), serviceActor),
  })
)
