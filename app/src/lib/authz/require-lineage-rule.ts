import { NextResponse } from "next/server"
import type { Session } from "next-auth"
import { requireAuth } from "@/lib/api-helpers"
import { canConfirmLineageRule, canPseudonymizeActuals, type ProjectActor } from "./policy"

type SystemDecision = (actor: Pick<ProjectActor, "systemRole">) => boolean

/** A signed-in user for whom a system-wide policy.ts decision (not a project action) says yes; else 401 / 403. */
async function requireSystemDecision(decide: SystemDecision): Promise<{ session: Session } | { error: NextResponse }> {
  const gate = await requireAuth()
  if ("error" in gate) return gate as { error: NextResponse }
  if (!decide({ systemRole: gate.session.user.role ?? "member" })) {
    return { error: NextResponse.json({ error: "管理者権限が必要です", code: "ADMIN_REQUIRED" }, { status: 403 }) }
  }
  return { session: gate.session }
}

/** Shared (lineage / project-type) lesson rules: the decision lives in policy.ts (`canConfirmLineageRule`). */
export function requireLineageRuleConfirmer(): Promise<{ session: Session } | { error: NextResponse }> {
  return requireSystemDecision(canConfirmLineageRule)
}

/** Pseudonymising actuals owners (plan 12 §4 / Q8): `canPseudonymizeActuals`. */
export function requireActualsPseudonymizer(): Promise<{ session: Session } | { error: NextResponse }> {
  return requireSystemDecision(canPseudonymizeActuals)
}
