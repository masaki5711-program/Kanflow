import { NextResponse } from "next/server"
import type { Session } from "next-auth"
import { requireAuth } from "@/lib/api-helpers"
import { canConfirmLineageRule } from "./policy"

/** Shared (lineage / project-type) lesson rules: the decision lives in policy.ts (`canConfirmLineageRule`). */
export async function requireLineageRuleConfirmer(): Promise<{ session: Session } | { error: NextResponse }> {
  const gate = await requireAuth()
  if ("error" in gate) return gate as { error: NextResponse }
  if (!canConfirmLineageRule({ systemRole: gate.session.user.role ?? "member" })) {
    return { error: NextResponse.json({ error: "管理者権限が必要です", code: "ADMIN_REQUIRED" }, { status: 403 }) }
  }
  return { session: gate.session }
}
