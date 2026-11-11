"use client"

import Link from "next/link"
import { GitPullRequestClosed } from "lucide-react"
import { useApiQuery } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import { fillTemplate } from "@/lib/fill-template"
import type { MyBlockedMrItem, MyBlockedMrsResult } from "@/services/git/my-blocked-mrs.service"
import { gitApiBase, toMergeState } from "./git-client-state"
import { MergeState } from "./merge-state"
import { isRecord } from "./use-mr-approvals"

/** Pure: `/git/my-blocked-mrs` body → result (anything unexpected is dropped; nothing is shown for a bad body). */
export function toMyBlockedMrs(raw: unknown): MyBlockedMrsResult {
  if (!isRecord(raw) || raw.enabled !== true) return { enabled: false, items: [] }
  const items = Array.isArray(raw.items)
    ? raw.items.flatMap((i): MyBlockedMrItem[] => {
        if (!isRecord(i)) return []
        const merge = toMergeState(i.merge)
        const str = (v: unknown) => (typeof v === "string" ? v : null)
        const linkId = str(i.linkId)
        const iid = str(i.iid)
        const pbiId = str(i.pbiId)
        const pbiKey = str(i.pbiKey)
        if (!merge || !linkId || !iid || !pbiId || !pbiKey || typeof i.pbiDisplayId !== "number" || (i.mine !== "branch" && i.mine !== "author")) return []
        return [{ linkId, iid, title: str(i.title) ?? "", url: str(i.url) ?? "", repository: str(i.repository) ?? "", pbiId, pbiKey, pbiDisplayId: i.pbiDisplayId, mine: i.mine, branch: str(i.branch), merge }]
      })
    : []
  return { enabled: true, items }
}

/**
 * 自分の MR で止まっているもの (N10, dashboard 自分のタスク): the user's open merge requests that cannot merge yet or are
 * predicted to conflict, each with the PBI panel's reasons and next steps (MergeState). Nothing at all when the project
 * does not read Git, the request fails, or nothing is stuck. Read from Kanflow's copy: the time of the read is shown.
 */
export function MyBlockedMrs({ projectId, enabled }: { projectId: string; enabled: boolean }) {
  const { t } = useLanguage()
  const { data } = useApiQuery<MyBlockedMrsResult>(enabled ? `${gitApiBase(projectId)}/my-blocked-mrs` : null, { parse: toMyBlockedMrs, toastOnError: false })
  if (!enabled || !data?.enabled || data.items.length === 0) return null
  return (
    <section aria-labelledby="dashboard-my-blocked-mr-heading" className="mt-3 border-t border-border pt-3">
      <h3 id="dashboard-my-blocked-mr-heading" className="flex items-center gap-2 text-caption font-semibold text-fg">
        <GitPullRequestClosed aria-hidden="true" className="h-4 w-4 text-fg-muted" />
        {t.gitDevMyBlockedTitle}
        <span className="text-caption font-normal text-fg-muted">({data.items.length})</span>
      </h3>
      <ul className="mt-1 divide-y divide-border">
        {data.items.map((item) => (
          <li key={item.linkId} className="py-2" data-my-blocked-mr={item.iid}>
            <Link href={`/projects/${projectId}/backlog?pbi=${item.pbiDisplayId}`} className="line-clamp-2 min-w-0 break-words rounded-sm text-body text-fg hover:text-primary">
              <span className="mr-1.5 font-mono text-caption text-fg-muted">{item.pbiKey}</span>
              <span className="mr-1.5 font-mono text-caption text-fg-muted">!{item.iid}</span>
              {item.title}
            </Link>
            <p className="text-caption text-fg-subtle">
              {item.repository}
              {" · "}
              {item.mine === "branch" && item.branch ? fillTemplate(t.gitDevMyBlockedByBranch, { branch: item.branch }) : t.gitDevMyBlockedByAuthor}
            </p>
            <MergeState merge={item.merge} />
          </li>
        ))}
      </ul>
    </section>
  )
}
