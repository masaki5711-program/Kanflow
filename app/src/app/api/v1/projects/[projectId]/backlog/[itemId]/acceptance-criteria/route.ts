import { createAcceptanceCriterionOp, listAcceptanceCriteriaOp } from "../../../../../_lib/v1-handlers"
import { v1ProjectRoute } from "../../../../../_lib/v1-route"
import { v1ProjectWrite } from "../../../../../_lib/v1-write"

type Params = { projectId: string; itemId: string }

/** GET /api/v1/projects/:projectId/backlog/:itemId/acceptance-criteria — the PBI's 受入基準 items (`PBI-12/AC-2`), `seq` order. */
export const GET = v1ProjectRoute<Params>(async ({ projectId, params }) => listAcceptanceCriteriaOp(projectId, params.itemId))

/**
 * POST .../acceptance-criteria `{ given?, when?, then?, text?, evidenceKind? }` — add a criterion
 * (`backlog:write`; PO / SM). At least one of given / when / then / text. 201 `{ data }`.
 * Idempotency-Key honoured.
 */
export const POST = v1ProjectWrite<Params>("backlog.write", 201, createAcceptanceCriterionOp, { idempotent: true })
