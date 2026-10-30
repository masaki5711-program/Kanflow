import { getPbi } from "@/services/api-v1/api-v1.service"
import { updatePbiOp } from "../../../../_lib/v1-handlers"
import { v1ProjectRoute } from "../../../../_lib/v1-route"
import { v1ProjectWrite } from "../../../../_lib/v1-write"

type Params = { projectId: string; itemId: string }

/** GET /api/v1/projects/:projectId/backlog/:itemId — one PBI with its sprint tasks; `:itemId` = id, "12" or "PBI-12". */
export const GET = v1ProjectRoute<Params>(async ({ projectId, params }) => getPbi(projectId, params.itemId))

/**
 * PATCH /api/v1/projects/:projectId/backlog/:itemId — edit a PBI (`backlog:write`; PO / SM). Send `version` to
 * detect conflicts (409). `sortOrder` is ignored: ordering belongs to `backlog:reorder`.
 */
export const PATCH = v1ProjectWrite<Params>("backlog.write", 200, updatePbiOp)
