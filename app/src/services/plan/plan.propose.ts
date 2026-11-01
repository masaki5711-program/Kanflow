/**
 * propose_plan_items (MCP, W12): a base schedule (phases, milestones, relative durations in days,
 * dependencies — the `schedule.yml` of a spec template) plus a start date becomes ONE `plan_load` proposal
 * in a chat thread of the token's owner — the existing AI-chat approval card. NOTHING is written to the plan:
 * the owner (a PO / SM, `plan.write`) approves the card, which calls POST /plan/load under their own rights.
 * The same call again maps to the same proposal id (one card state) but opens a new thread only per call.
 */
import { createHash } from "node:crypto"
import { baseScheduleSchema, planBaseSchedule, PlanScheduleError, startDateSchema, type BaseSchedule } from "@/lib/plan-schedule/base-schedule"
import { chatProposalSchema, type PlanLoadProposal } from "@/lib/chat-proposals"
import type { Actor } from "@/services/_shared/actor"
import { defaultDb, withTransaction } from "@/services/_shared/db"
import { NotFoundError, ValidationError } from "@/services/_shared/errors"
import * as chat from "@/services/chat-threads/chat-threads.repository"
import { serializeToolEvents } from "@/services/chat-threads/chat-threads.service"
import * as planRepo from "./plan.repository"
import { z } from "zod"

export const proposePlanItemsSchema = z.object({
  startDate: startDateSchema,
  schedule: baseScheduleSchema,
  /** Shown as the card heading (e.g. the base repository's name). */
  name: z.string().trim().max(200).optional(),
  reason: z.string().trim().max(1000).optional(),
})
export type ProposePlanItemsInput = z.infer<typeof proposePlanItemsSchema>

/** The stored proposal (the whole schedule travels with it) must fit the chat thread's event column. */
const PROPOSAL_MAX_BYTES = 55_000
const PREVIEW_ROWS = 60
/** Child names shown under each top-level row of the card ("+N more" for the rest). */
const PREVIEW_CHILDREN = 5

export function buildPlanLoadProposal(input: { startDate: string; schedule: BaseSchedule; name?: string; reason?: string }): PlanLoadProposal {
  let planned
  try {
    planned = planBaseSchedule(input.schedule, input.startDate)
  } catch (error) {
    if (error instanceof PlanScheduleError) throw new ValidationError(error.message, {}, error.code)
    throw error
  }
  const childCount = new Map<string, number>()
  const childNames = new Map<string, string[]>()
  for (const r of planned.rows) {
    if (!r.parentKey) continue
    childCount.set(r.parentKey, (childCount.get(r.parentKey) ?? 0) + 1)
    const names = childNames.get(r.parentKey) ?? []
    if (names.length < PREVIEW_CHILDREN) childNames.set(r.parentKey, [...names, r.name.slice(0, 500)])
  }
  const preview = planned.rows
    .filter((r) => r.parentKey === null)
    .slice(0, PREVIEW_ROWS)
    .map((r) => ({ name: r.name.slice(0, 500), plannedStart: r.plannedStart, plannedEnd: r.plannedEnd, isMilestone: r.isMilestone, children: childCount.get(r.key) ?? 0, childNames: childNames.get(r.key) ?? [] }))
  const digest = createHash("sha256").update(JSON.stringify({ s: input.startDate, p: input.schedule })).digest("hex").slice(0, 16)
  const proposal = {
    kind: "plan_load" as const,
    proposalId: `prop_plan_${digest}`,
    name: input.name?.trim() || "ベースのスケジュール",
    startDate: input.startDate,
    itemCount: planned.rows.length,
    dependencyCount: planned.rows.reduce((n, r) => n + r.dependsOn.length, 0),
    plannedStart: planned.plannedStart,
    plannedEnd: planned.plannedEnd,
    schedule: input.schedule,
    preview,
    reason: input.reason ?? "",
  }
  const checked = chatProposalSchema.safeParse(proposal)
  if (!checked.success || checked.data.kind !== "plan_load") throw new ValidationError("The proposal does not fit the proposal format", {}, "PLAN_SCHEDULE_INVALID")
  if (Buffer.byteLength(JSON.stringify([{ type: "proposal", proposal: checked.data }]), "utf8") > PROPOSAL_MAX_BYTES) {
    throw new ValidationError("The schedule is too large to propose in one card: shorten names or split it into phases", {}, "PLAN_PROPOSAL_TOO_LARGE")
  }
  return checked.data
}

export interface ProposePlanItemsResult {
  proposalId: string
  threadId: string
  itemCount: number
  dependencyCount: number
  plannedStart: string
  plannedEnd: string
  /** Where the owner approves it. */
  chatPath: string
}

export async function proposePlanItems(projectId: string, input: ProposePlanItemsInput, actor: Actor): Promise<ProposePlanItemsResult> {
  const projectName = await planRepo.findProjectName(defaultDb, projectId)
  if (projectName === null) throw new NotFoundError("Project not found")
  const proposal = buildPlanLoadProposal(input)
  const events = serializeToolEvents([{ type: "proposal", proposal }])
  // serializeToolEvents drops events that do not fit: never leave a card-less thread behind.
  if (!events) throw new ValidationError("The schedule is too large to propose in one card", {}, "PLAN_PROPOSAL_TOO_LARGE")
  const title = `全体計画の読み込み: ${proposal.name}`.slice(0, 190)
  const message = `${projectName}: ${proposal.itemCount} 件の計画（${proposal.plannedStart} 〜 ${proposal.plannedEnd}、依存 ${proposal.dependencyCount} 件）を提案します。内容を確かめて承認してください。承認するまで全体計画は変わりません。`
  return withTransaction(async (tx) => {
    const thread = await chat.createThread(tx, { projectId, userId: actor.userId }, title)
    await chat.insertMessage(tx, { threadId: thread.id, role: "assistant", content: message, toolEvents: events })
    return {
      proposalId: proposal.proposalId,
      threadId: thread.id,
      itemCount: proposal.itemCount,
      dependencyCount: proposal.dependencyCount,
      plannedStart: proposal.plannedStart,
      plannedEnd: proposal.plannedEnd,
      chatPath: `/projects/${projectId}/chat?thread=${thread.id}`,
    }
  })
}
