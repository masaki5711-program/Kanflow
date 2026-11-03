"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { useMemo, useState } from "react"
import { ArrowLeft, Gauge } from "lucide-react"
import { Button, EmptyState, PageHeader, Select, SkeletonTable, cn } from "@/components/ui"
import { useProjectDocumentTitle } from "@/components/app-shell/project-title-context"
import { CapacityList, type CapacityRowView } from "@/components/plan-capacity/capacity-list"
import { useApiQuery } from "@/hooks"
import { fillTemplate } from "@/lib/fill-template"
import { formatLongDate } from "@/lib/format-date"
import { useLanguage } from "@/lib/language-context"
import { tokyoDateKey } from "@/lib/plan-progress"

interface MemberLoadRow {
  userId: string
  name: string
  maxUtilization: number
  daysOver: number
  overlapDays: number
  days: { date: string; utilization: number }[]
}

interface LoadResponse {
  members: MemberLoadRow[]
  canViewOthers: boolean
  canManageAllocations: boolean
  viewerId: string
}

const WEEKS = [2, 4, 8, 13] as const

function addDaysKey(key: string, days: number): string {
  const d = new Date(`${key}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Utilization → day mark. The row's numbers carry the information; the strip adds a shape cue besides the colour
 * (free = short outline, working = full bar, over = full bar with a top cap), explained by the legend.
 */
const mark = (u: number) =>
  u > 1 ? "h-4 bg-danger border-t-2 border-fg" : u > 0 ? "h-4 bg-success" : "h-1.5 self-end border border-border-strong bg-surface"

/**
 * 稼働量と負荷 (plan 12 E4): members' load across all projects (utilization, days over capacity, overlapping days —
 * never other projects' item names), the allocation of members to this project (PO / SM), and the viewer's own
 * capacity.
 */
export default function CapacityPage() {
  const projectId = useParams().projectId as string
  const { t, language } = useLanguage()
  useProjectDocumentTitle(t.pcpTitle)
  const [weeks, setWeeks] = useState<(typeof WEEKS)[number]>(4)
  const from = useMemo(() => tokyoDateKey(new Date()), [])
  const to = addDaysKey(from, weeks * 7 - 1)
  const load = useApiQuery<LoadResponse>(`/api/projects/${projectId}/plan/member-load?from=${from}&to=${to}`)
  const viewerId = load.data?.viewerId ?? null
  const allocations = useApiQuery<{ members: { userId: string; name: string }[]; allocations: CapacityRowView[] }>(load.data?.canManageAllocations ? `/api/projects/${projectId}/capacity` : null)
  const own = useApiQuery<{ capacities: CapacityRowView[] }>(viewerId ? `/api/users/${viewerId}/capacity` : null)

  const pct = (u: number) => fillTemplate(t.pcpPercent, { n: Math.round(u * 100) })
  const days = (n: number) => fillTemplate(t.pcpDays, { n })

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href={`/projects/${projectId}/plan`} className="inline-flex items-center gap-1 rounded-ui-sm text-body text-fg-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        {t.pcpBackToPlan}
      </Link>
      <PageHeader title={t.pcpTitle} description={t.pcpDescription} icon={<Gauge className="h-6 w-6" />} />

      <section aria-labelledby="pcp-load" className="space-y-3 rounded-ui-lg border border-border bg-surface p-4 shadow-ui-sm sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="pcp-load" className="text-title font-semibold text-fg">
            {t.pcpLoadTitle}
          </h2>
          <label className="flex items-center gap-2 text-body text-fg-muted">
            {t.pcpLoadWindow}
            <Select selectSize="sm" value={String(weeks)} onChange={(e) => setWeeks(Number(e.target.value) as (typeof WEEKS)[number])}>
              {WEEKS.map((w) => (
                <option key={w} value={w}>
                  {fillTemplate(t.pcpLoadWeeks, { n: w })}
                </option>
              ))}
            </Select>
          </label>
        </div>
        {load.data && !load.data.canViewOthers && <p className="text-caption text-fg-muted">{t.pcpLoadOwnOnly}</p>}
        {load.isLoading && !load.data ? (
          <SkeletonTable label={t.loading} />
        ) : load.error && !load.data ? (
          <EmptyState compact headingLevel={3} title={t.pcpLoadFailed} action={<Button size="sm" onClick={() => void load.refetch()}>{t.errorRetry}</Button>} />
        ) : (load.data?.members.length ?? 0) === 0 ? (
          <EmptyState compact headingLevel={3} title={t.pcpLoadEmpty} />
        ) : (
          <>
          <div className="overflow-x-auto rounded-ui-lg border border-border" role="region" aria-labelledby="pcp-load-caption" tabIndex={0} aria-busy={load.isFetching || undefined}>
            <table className="w-full min-w-[40rem] text-body tabular-nums">
              <caption id="pcp-load-caption" className="sr-only">
                {fillTemplate(t.pcpTableCaption, { from: formatLongDate(from, language, { utc: true }), to: formatLongDate(to, language, { utc: true }) })}
              </caption>
              <thead className="bg-surface-sunken text-left text-caption text-fg-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">{t.pcpColMember}</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">{t.pcpColMaxUtil}</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">{t.pcpColDaysOver}</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">{t.pcpColOverlap}</th>
                  <th scope="col" className="px-3 py-2 font-medium" aria-hidden="true">
                    {t.pcpColStrip}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {load.data?.members.map((m) => (
                  <tr key={m.userId}>
                    <th scope="row" className="px-3 py-2 text-left font-medium text-fg [overflow-wrap:anywhere]">
                      {m.name}
                    </th>
                    <td className={cn("px-3 py-2 text-right font-semibold", m.maxUtilization > 1 ? "text-danger" : "text-fg")}>{pct(m.maxUtilization)}</td>
                    <td className="px-3 py-2 text-right">{days(m.daysOver)}</td>
                    <td className="px-3 py-2 text-right">{days(m.overlapDays)}</td>
                    <td className="px-3 py-2" aria-hidden="true">
                      {/* Visual summary only: the numbers in the row are the accessible content. */}
                      <div className="flex h-4 items-end gap-px" title={fillTemplate(t.pcpStripLabel, { name: m.name })}>
                        {m.days.map((d) => (
                          <span key={d.date} className={cn("w-1.5 shrink-0 rounded-[1px]", mark(d.utilization))} />
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-fg-muted" aria-hidden="true">
            {(
              [
                [0, t.pcpLegendFree],
                [1, t.pcpLegendBusy],
                [2, t.pcpLegendOver],
              ] as const
            ).map(([u, label]) => (
              <span key={label} className="inline-flex items-center gap-1.5">
                <span className="flex h-4 items-end">
                  <span className={cn("w-1.5 rounded-[1px]", mark(u))} />
                </span>
                {label}
              </span>
            ))}
          </div>
          <p className="text-caption text-fg-muted">{t.pcpUtilNote}</p>
          </>
        )}
      </section>

      {load.data?.canManageAllocations && (
        <section aria-labelledby="pcp-alloc" className="space-y-3 rounded-ui-lg border border-border bg-surface p-4 shadow-ui-sm sm:p-5">
          <div>
            <h2 id="pcp-alloc" className="text-title font-semibold text-fg">
              {t.pcpAllocTitle}
            </h2>
            <p className="mt-0.5 text-caption text-fg-muted">{t.pcpAllocHint}</p>
          </div>
          {allocations.error && !allocations.data ? (
            <EmptyState compact headingLevel={3} title={t.pcpListFailed} action={<Button size="sm" onClick={() => void allocations.refetch()}>{t.errorRetry}</Button>} />
          ) : allocations.data ? (
            <CapacityList
              rows={allocations.data.allocations}
              url={`/api/projects/${projectId}/capacity`}
              members={allocations.data.members}
              canEdit
              headingId="pcp-alloc"
              emptyText={t.pcpAllocEmpty}
              onChanged={() => {
                allocations.refetch()
                load.refetch()
              }}
            />
          ) : (
            <SkeletonTable label={t.loading} />
          )}
        </section>
      )}

      {viewerId && (
        <section aria-labelledby="pcp-own" className="space-y-3 rounded-ui-lg border border-border bg-surface p-4 shadow-ui-sm sm:p-5">
          <div>
            <h2 id="pcp-own" className="text-title font-semibold text-fg">
              {t.pcpOwnTitle}
            </h2>
            <p className="mt-0.5 text-caption text-fg-muted">{t.pcpOwnHint}</p>
          </div>
          {own.error && !own.data ? (
            <EmptyState compact headingLevel={3} title={t.pcpListFailed} action={<Button size="sm" onClick={() => void own.refetch()}>{t.errorRetry}</Button>} />
          ) : own.data ? (
            <CapacityList
              rows={own.data.capacities}
              url={`/api/users/${viewerId}/capacity`}
              canEdit
              headingId="pcp-own"
              emptyText={t.pcpOwnEmpty}
              onChanged={() => {
                own.refetch()
                load.refetch()
              }}
            />
          ) : (
            <SkeletonTable label={t.loading} />
          )}
        </section>
      )}
    </div>
  )
}
