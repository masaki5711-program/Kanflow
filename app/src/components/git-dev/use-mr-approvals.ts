"use client"

import { useEffect, useMemo } from "react"
import { useApiQuery } from "@/hooks"
import { useLiveRefetch } from "@/components/realtime/use-live-refetch"
import { GIT_SYNCED_EVENT, gitApiBase } from "./git-client-state"
import type { MrApprovalItem, MrApprovalsResult } from "@/services/git/mr-approvals.service"

export type { MrApprovalItem }

export interface MrApprovalsView {
  /** Per link id: what the user could do through GitStation. */
  items: ReadonlyMap<string, MrApprovalItem>
  /** Links whose approval state could not be read (no buttons, a note). */
  failed: ReadonlySet<string>
  /** The user has no employee number: one note for the panel, no buttons. */
  noEmployeeNumber: boolean
  refetch: () => void
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null
const trial = (v: unknown) => (isRecord(v) && typeof v.allowed === "boolean" ? { allowed: v.allowed, reason: typeof v.reason === "string" ? v.reason : null } : { allowed: false, reason: null })

/** Pure: `/git/mr-approvals` body → result (anything unexpected → not supported). */
export function toMrApprovals(raw: unknown): MrApprovalsResult {
  if (!isRecord(raw) || raw.supported !== true) {
    const reason = isRecord(raw) && raw.reason === "no_employee_number" ? "no_employee_number" : "off"
    return { supported: false, reason }
  }
  const items = Array.isArray(raw.items)
    ? raw.items.flatMap((i): MrApprovalItem[] =>
        isRecord(i) && typeof i.linkId === "string" && typeof i.iid === "number"
          ? [{
              linkId: i.linkId,
              iid: i.iid,
              headSha: typeof i.headSha === "string" ? i.headSha : null,
              approvals: typeof i.approvals === "number" ? i.approvals : null,
              approvedByMe: i.approvedByMe === true,
              canApprove: trial(i.canApprove),
              canUnapprove: trial(i.canUnapprove),
            }]
          : [],
      )
    : []
  const failed = Array.isArray(raw.failed) ? raw.failed.filter((f): f is string => typeof f === "string") : []
  return { supported: true, items, failed }
}

/**
 * Approval state of the PBI's open GitStation merge requests (plan 11 K4). No request while the PBI has no open
 * merge request; a refusal (no `git.approve`, Git off) simply shows no buttons.
 */
export function useMrApprovals(projectId: string, pbiId: string, hasOpenMr: boolean): MrApprovalsView {
  const url = hasOpenMr ? `${gitApiBase(projectId)}/mr-approvals?pbiId=${encodeURIComponent(pbiId)}` : null
  const { data, refetch } = useApiQuery<MrApprovalsResult>(url, { parse: toMrApprovals, toastOnError: false })
  const supported = data?.supported === true

  useEffect(() => {
    if (!supported) return
    window.addEventListener(GIT_SYNCED_EVENT, refetch)
    return () => window.removeEventListener(GIT_SYNCED_EVENT, refetch)
  }, [supported, refetch])
  useLiveRefetch(refetch, { types: ["git"], projectId, enabled: supported })

  return useMemo(() => {
    if (!data || !data.supported) return { items: new Map(), failed: new Set(), noEmployeeNumber: data?.supported === false && data.reason === "no_employee_number", refetch }
    return { items: new Map(data.items.map((i) => [i.linkId, i])), failed: new Set(data.failed), noEmployeeNumber: false, refetch }
  }, [data, refetch])
}
