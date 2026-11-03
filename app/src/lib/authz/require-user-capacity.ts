import { NextResponse } from "next/server"
import type { Session } from "next-auth"
import { requireAuth } from "@/lib/api-helpers"
import { sharesSectionAsManager } from "@/services/plan-leveling/capacity.service"
import { canManageUserCapacity } from "./policy"

/**
 * A signed-in user who may manage `targetUserId`'s OWN FTE (plan 12 §4): the person, a section manager of their
 * section, or an admin — the decision is `canManageUserCapacity` in policy.ts. Others get 403.
 */
export async function requireUserCapacityManager(targetUserId: string): Promise<{ session: Session } | { error: NextResponse }> {
  const gate = await requireAuth()
  if ("error" in gate) return gate as { error: NextResponse }
  const actor = { userId: gate.session.user.id, systemRole: gate.session.user.role ?? "member" }
  const shares = await sharesSectionAsManager(actor.userId, actor.systemRole, targetUserId)
  if (!canManageUserCapacity(actor, targetUserId, shares)) return { error: NextResponse.json({ error: "権限がありません", code: "FORBIDDEN" }, { status: 403 }) }
  return { session: gate.session }
}
