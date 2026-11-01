import { deleteAcceptanceCriterionOp, updateAcceptanceCriterionOp } from "../../../../../../_lib/v1-handlers"
import { v1ProjectWrite } from "../../../../../../_lib/v1-write"

type Params = { projectId: string; itemId: string; acRef: string }

/** PATCH .../acceptance-criteria/:acRef (`AC-2`, `2` or `PBI-12/AC-2` URL-encoded) — edit the sent fields (`backlog:write`; PO / SM). */
export const PATCH = v1ProjectWrite<Params>("backlog.write", 200, updateAcceptanceCriterionOp)

/** DELETE .../acceptance-criteria/:acRef — soft delete; the number is never reused (`backlog:write`; PO / SM). */
export const DELETE = v1ProjectWrite<Params>("backlog.write", 200, deleteAcceptanceCriterionOp)
