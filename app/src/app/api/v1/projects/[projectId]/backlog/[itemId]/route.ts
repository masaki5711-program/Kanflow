import { updateBacklogItemSchema } from "@/services/backlog/backlog.schemas"
import { updateBacklogItem } from "@/services/backlog/backlog.service"
import { getPbi } from "@/services/api-v1/api-v1.service"
import { v1ProjectRoute } from "../../../../_lib/v1-route"
import { v1ProjectWrite } from "../../../../_lib/v1-write"

type Params = { projectId: string; itemId: string }

/** Ordering belongs to `backlog:reorder` (the UI's PUT /backlog/reorder), not to a field edit. */
const v1UpdatePbiSchema = updateBacklogItemSchema.omit({ sortOrder: true })

/** GET /api/v1/projects/:projectId/backlog/:itemId — one PBI with its sprint tasks; `:itemId` = id, "12" or "PBI-12". */
export const GET = v1ProjectRoute<Params>(async ({ projectId, params }) => getPbi(projectId, params.itemId))

/** PATCH /api/v1/projects/:projectId/backlog/:itemId — edit a PBI (`backlog:write`; PO / SM). Send `version` to detect conflicts (409). */
export const PATCH = v1ProjectWrite<Params>("backlog.write", 200, async ({ projectId, params, body, serviceActor }) => {
  const input = v1UpdatePbiSchema.parse(body)
  const { data: pbi } = await getPbi(projectId, params.itemId)
  return { data: await updateBacklogItem(projectId, pbi.id, input, serviceActor) }
})
