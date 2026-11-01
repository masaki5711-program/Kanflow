import { feedbackProjectOf, reportFailureOp } from "../../_lib/v1-feedback-handlers"
import { v1AccountWrite } from "../../_lib/v1-write"

/**
 * POST /api/v1/feedback/failures `{ tool, text, errorCode?, source?, projectId?, sessionRef?, branch?, techs? }`
 * (`dev:write`; with `projectId` also the owner's dev.write in that project). Redacts, stores the failure and
 * answers with up to 3 confirmed lessons that apply. 201 stored, 200 folded into an identical report of the
 * last minute, 422 FEEDBACK_REDACTION_FAILED (nothing stored), 429 over the per-token budget.
 */
export const POST = v1AccountWrite("dev.write", 201, ({ principal, body, serviceActor }) => reportFailureOp({ principal, body, serviceActor }), {
  idempotent: true,
  ownBudget: true,
  projectOf: feedbackProjectOf,
})
