import { systemizeLessonOp } from "../../../../_lib/v1-feedback-handlers"
import { v1AccountWrite } from "../../../../_lib/v1-write"

/**
 * POST /api/v1/feedback/lessons/:id/systemize (token scope `sprint:write`; the owner must curate the lesson's scope —
 * system admin / section manager for global and tech lessons, the project's PO / SM for project lessons).
 */
export const POST = v1AccountWrite<{ id: string }>("sprint.manage", 200, ({ principal, body, serviceActor, params }) => systemizeLessonOp({ principal, body, serviceActor, params }))
