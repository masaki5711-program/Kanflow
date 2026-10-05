/**
 * Route helpers shared by the plan template endpoints: a per-user write rate
 * limit and a size-bounded JSON body reader (templates are user-sized JSON).
 */
import type { NextResponse } from "next/server"
import { getRateLimiter, retryAfterSeconds } from "@/lib/rate-limit"
import { TEMPLATE_MAX_JSON_CHARS } from "@/lib/plan-templates/schema"
import { StatusError, errorResponse } from "@/services/_shared"
import { TEMPLATE_WRITE_RATE_LIMIT } from "./plan-templates.schemas"

/** Body cap: the content limit plus room for name / description / metadata. */
export const TEMPLATE_BODY_MAX_CHARS = TEMPLATE_MAX_JSON_CHARS + 10_000

/** 429 when the user is over the template write budget, else null (and the hit is recorded). */
export function templateWriteLimited(userId: string): NextResponse | null {
  const limiter = getRateLimiter("plan-templates:write", TEMPLATE_WRITE_RATE_LIMIT)
  const status = limiter.peek(userId)
  if (status.limited) return errorResponse(429, "Too many requests", "RATE_LIMITED", { headers: { "Retry-After": retryAfterSeconds(status) } })
  limiter.hit(userId)
  return null
}

/** JSON body (an empty body reads as `{}`); 413 PAYLOAD_TOO_LARGE over the cap, SyntaxError → 400 INVALID_JSON. */
export async function readTemplateBody(request: Request, maxChars: number = TEMPLATE_BODY_MAX_CHARS): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? 0)
  if (declared > maxChars * 4) throw new StatusError(413, "リクエストが大きすぎます", {}, "PAYLOAD_TOO_LARGE")
  const text = await request.text()
  if (text.length > maxChars) throw new StatusError(413, "リクエストが大きすぎます", {}, "PAYLOAD_TOO_LARGE")
  return text.trim() ? JSON.parse(text) : {}
}
