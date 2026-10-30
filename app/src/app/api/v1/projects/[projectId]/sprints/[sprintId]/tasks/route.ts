import { createTaskSchema } from "@/services/sprint-backlog/sprint-backlog.schemas"
import { createTask } from "@/services/sprint-backlog/sprint-backlog.service"
import { listSprintTasks } from "@/services/api-v1/api-v1.service"
import { v1ProjectRoute } from "../../../../../_lib/v1-route"
import { v1ProjectWrite } from "../../../../../_lib/v1-write"

type Params = { projectId: string; sprintId: string }

/** GET /api/v1/projects/:projectId/sprints/:sprintId/tasks */
export const GET = v1ProjectRoute<Params>(async ({ projectId, params }) => listSprintTasks(projectId, params.sprintId))

/** POST /api/v1/projects/:projectId/sprints/:sprintId/tasks — a task under a PBI of the sprint (`task:write`; members). Idempotency-Key honoured. */
export const POST = v1ProjectWrite<Params>(
  "task.write",
  201,
  async ({ projectId, params, body, serviceActor }) => ({
    data: await createTask(projectId, params.sprintId, createTaskSchema.parse(body), serviceActor),
  }),
  { idempotent: true }
)
