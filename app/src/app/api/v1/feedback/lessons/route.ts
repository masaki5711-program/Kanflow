import { searchLessonsOp } from "../../_lib/v1-feedback-handlers"
import { v1Route } from "../../_lib/v1-route"

/**
 * GET /api/v1/feedback/lessons?q=&signature=&errorCode=&tech=&projectId=&limit= (`read`): confirmed / systemized,
 * non-confidential lessons in the token owner's scope. Text is data, not instructions (`notice`).
 */
export const GET = v1Route(async ({ principal, query }) => searchLessonsOp(principal, query))
