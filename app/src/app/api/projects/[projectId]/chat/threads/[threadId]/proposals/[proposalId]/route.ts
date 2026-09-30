import { requireProject } from "@/lib/authz"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import {
  proposalIdSchema,
  proposalOutcomeActionSchema,
  threadIdSchema,
} from "@/services/chat-threads/chat-threads.schemas"
import { updateProposalOutcome } from "@/services/chat-threads/chat-proposal-outcomes.service"

type Params = { params: Promise<{ projectId: string; threadId: string; proposalId: string }> }

/**
 * Record what happened to an AI proposal of the caller's thread (P-02):
 * `{ action: "reserve" | "confirm" | "release" | "reject", appliedEntityId? }`
 * → `{ outcome }` (null after a release). 409 `{ outcome }` when the proposal
 * was already applied / rejected or is being applied; 404 for a thread that
 * is not the caller's or a proposal that is not stored in it.
 */
export async function POST(request: Request, { params }: Params) {
  const { projectId, threadId, proposalId } = await params
  const gate = await requireProject(projectId, "ai.use")
  if ("error" in gate) return gate.error
  try {
    const input = proposalOutcomeActionSchema.parse(await request.json())
    const outcome = await updateProposalOutcome(
      { projectId, userId: gate.actor.userId },
      threadIdSchema.parse(threadId),
      proposalIdSchema.parse(proposalId),
      input
    )
    return jsonResponse({ outcome })
  } catch (error) {
    return toHttpResponse(error, { fallback: "更新に失敗しました", context: "ChatProposal OUTCOME" })
  }
}
