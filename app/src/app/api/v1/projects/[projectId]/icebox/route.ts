import { createIceboxItemSchema } from "@/services/icebox/icebox.schemas"
import { createIceboxItem } from "@/services/icebox/icebox.service"
import { v1ProjectWrite } from "../../../_lib/v1-write"

/** POST /api/v1/projects/:projectId/icebox — submit a request to the Icebox (`icebox:write`; members and section managers). Idempotency-Key honoured. */
export const POST = v1ProjectWrite<{ projectId: string }>(
  "icebox.write",
  201,
  async ({ projectId, body, serviceActor }) => ({
    data: await createIceboxItem(projectId, createIceboxItemSchema.parse(body), serviceActor),
  }),
  { idempotent: true }
)
