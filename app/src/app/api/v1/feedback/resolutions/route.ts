import { feedbackProjectOf, reportResolutionOp } from "../../_lib/v1-feedback-handlers"
import { v1AccountWrite } from "../../_lib/v1-write"

/**
 * POST /api/v1/feedback/resolutions `{ sessionRef, diffSummary, verifiedCommand?, cause?, scope?, evidence?, projectId?, failureEventId? }`
 * (`dev:write`). Attaches the fix to the session's latest unresolved failure and creates the draft lesson (or
 * counts the fix on the existing one). 404 FEEDBACK_NO_FAILURE when there is none.
 */
export const POST = v1AccountWrite("dev.write", 201, ({ principal, body, serviceActor }) => reportResolutionOp({ principal, body, serviceActor }), {
  idempotent: true,
  ownBudget: true,
  projectOf: feedbackProjectOf,
})
