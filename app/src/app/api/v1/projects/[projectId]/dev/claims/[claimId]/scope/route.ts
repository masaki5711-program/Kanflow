import { declareScopeOp } from "../../../../../../_lib/v1-dev-handlers"
import { v1ProjectWrite } from "../../../../../../_lib/v1-write"

/**
 * PUT /api/v1/projects/:projectId/dev/claims/:claimId/scope `{ scope: [{ kind: "path" | "module", value }] }`
 * — 触る範囲 (W4): the claim's user replaces the files / modules the session will touch (`dev:write`;
 * at most 200 distinct entries; [] clears). 200 `{ data: { scope, overlaps } }` — overlaps with other
 * active claims are a warning, never a refusal. Naturally idempotent (same body = same state).
 */
export const PUT = v1ProjectWrite<{ projectId: string; claimId: string }>("dev.write", 200, declareScopeOp)
