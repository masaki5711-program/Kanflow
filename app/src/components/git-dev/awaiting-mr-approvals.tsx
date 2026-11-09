"use client"

import Link from "next/link"
import { GitPullRequest } from "lucide-react"
import { useApiQuery } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import type { AwaitingMrApprovalItem, AwaitingMrApprovalsResult } from "@/services/git/mr-approvals.service"
import { gitApiBase } from "./git-client-state"
import { MrApprovalControls } from "./mr-approval-controls"
import { isRecord, toMrApprovalItem } from "./use-mr-approvals"

/** Pure: `/git/mr-approvals/awaiting` body → result (anything unexpected → not supported, nothing shown). */
export function toAwaitingMrApprovals(raw: unknown): AwaitingMrApprovalsResult {
  if (!isRecord(raw) || raw.supported !== true) {
    const reason = isRecord(raw) && raw.reason === "no_employee_number" ? "no_employee_number" : "off"
    return { supported: false, reason }
  }
  const items = Array.isArray(raw.items)
    ? raw.items.flatMap((i): AwaitingMrApprovalItem[] => {
        const base = toMrApprovalItem(i)
        if (!base || !isRecord(i) || typeof i.pbiId !== "string" || typeof i.pbiKey !== "string" || typeof i.pbiDisplayId !== "number") return []
        return [{ ...base, pbiId: i.pbiId, pbiKey: i.pbiKey, pbiDisplayId: i.pbiDisplayId, title: typeof i.title === "string" ? i.title : "", url: typeof i.url === "string" ? i.url : "" }]
      })
    : []
  const failed = Array.isArray(raw.failed) ? raw.failed.filter((f): f is string => typeof f === "string") : []
  return { supported: true, items, failed }
}

/**
 * 承認を待っている MR (dashboard, 自分のタスク): the project's open GitStation merge requests the signed-in user could
 * approve now, each with its PBI and the same 承認する flow as the PBI panel. Nothing at all when `enabled` is false
 * (the project does not read GitStation, or no `git.approve`), when the request is refused or when the list is empty;
 * one note when the user has no employee number.
 */
export function AwaitingMrApprovals({ projectId, enabled }: { projectId: string; enabled: boolean }) {
  const { t } = useLanguage()
  const { data, refetch } = useApiQuery<AwaitingMrApprovalsResult>(enabled ? `${gitApiBase(projectId)}/mr-approvals/awaiting` : null, { parse: toAwaitingMrApprovals, toastOnError: false })
  if (!enabled || !data) return null
  if (!data.supported) {
    if (data.reason !== "no_employee_number") return null
    return <p className="mt-3 rounded-ui-sm bg-surface-muted px-2 py-1.5 text-caption text-fg-muted">{t.gitDevApproveNoEmployee}</p>
  }
  if (data.items.length === 0) return null
  return (
    <section aria-labelledby="dashboard-awaiting-mr-heading" className="mt-3 border-t border-border pt-3">
      <h3 id="dashboard-awaiting-mr-heading" className="flex items-center gap-2 text-caption font-semibold text-fg">
        <GitPullRequest aria-hidden="true" className="h-4 w-4 text-fg-muted" />
        {t.gitDevAwaitingTitle}
        <span className="text-caption font-normal text-fg-muted">({data.items.length})</span>
      </h3>
      <ul className="mt-1 divide-y divide-border">
        {data.items.map((item) => (
          <li key={item.linkId} className="py-2" data-awaiting-mr={item.iid}>
            <Link href={`/projects/${projectId}/backlog?pbi=${item.pbiDisplayId}`} className="line-clamp-2 min-w-0 break-words rounded-sm text-body text-fg hover:text-primary">
              <span className="mr-1.5 font-mono text-caption text-fg-muted">{item.pbiKey}</span>
              <span className="mr-1.5 font-mono text-caption text-fg-muted">!{item.iid}</span>
              {item.title}
            </Link>
            <MrApprovalControls projectId={projectId} item={item} onChanged={refetch} />
          </li>
        ))}
      </ul>
    </section>
  )
}
