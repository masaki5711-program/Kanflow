"use client"

import Link from "next/link"
import { useState } from "react"
import { AlertTriangle, ChevronLeft, ChevronRight, ExternalLink, GitMerge } from "lucide-react"
import { Button, EmptyState, Field, Select, SkeletonTable, cn } from "@/components/ui"
import { useApiQuery } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import { fillTemplate } from "@/lib/fill-template"
import { formatDateTime } from "@/lib/format-date"
import { pbiKey } from "@/lib/git/pbi-keys"
import { useLiveRefetch } from "@/components/realtime/use-live-refetch"
import type { Translations } from "@/lib/i18n"
import type { GitRepositoryDto } from "./git-labels"
import {
  MERGE_PERIODS,
  isMergePeriod,
  isWebUrl,
  leadTime,
  mergeHistoryUrl,
  toMergeHistory,
  type LeadTime,
  type MergeHistoryDto,
  type MergeHistoryItemDto,
  type MergePeriod,
} from "./merge-history-model"

interface Props {
  projectId: string
  /** The project's repositories (for the filter; shown only when there are several). */
  repositories: ReadonlyArray<Pick<GitRepositoryDto, "id" | "name">>
}

const TH = "px-3 py-2 text-left align-bottom text-caption font-semibold text-fg-muted"
const TD = "px-3 py-2.5 text-caption text-fg"
const COLUMNS = 8

/**
 * マージの履歴 (N11): merged merge requests linked to PBIs, newest first, from
 * Kanflow's own synced copy. Filters by period and repository; older pages are
 * reached with a cursor (the stack of cursors is the way back).
 */
export function GitMergeHistory({ projectId, repositories }: Props) {
  const { t } = useLanguage()
  // One "now" per visit: the period's start (and so the request URL) stays put while paging.
  const [now] = useState(() => new Date())
  const [period, setPeriod] = useState<MergePeriod>("all")
  const [chosenRepository, setChosenRepository] = useState("")
  const [cursors, setCursors] = useState<readonly string[]>([])
  // A repository removed meanwhile is no longer a filter.
  const repositoryId = repositories.some((r) => r.id === chosenRepository) ? chosenRepository : ""
  const cursor = cursors[cursors.length - 1] ?? null

  const query = useApiQuery<MergeHistoryDto>(mergeHistoryUrl(projectId, { period, repositoryId, cursor }, now), { parse: toMergeHistory })
  // A sync that records a new merge shows up without a reload.
  useLiveRefetch(query.refetch, { types: ["git"], projectId })
  const data = query.data

  // The integration was turned off meanwhile: the page itself says so.
  if (data && !data.enabled) return null

  const filtered = period !== "all" || repositoryId !== "" || cursors.length > 0
  const canNewer = cursors.length > 0
  const older = data?.nextCursor ?? null
  const pageNumber = cursors.length + 1
  const periodLabel = (p: MergePeriod) => (p === "all" ? t.gitMergesPeriodAll : p === "365" ? t.gitMergesPeriodYear : fillTemplate(t.gitMergesPeriodDays, { n: p }))
  // What a screen reader hears once a page has loaded (filters keep the page number, so the page label alone is not enough).
  const status =
    !data || query.isFetching
      ? ""
      : data.items.length > 0
        ? fillTemplate(t.gitMergesResult, { n: pageNumber, count: data.items.length })
        : filtered
          ? t.gitMergesEmptyFiltered
          : t.gitMergesEmpty

  return (
    <section aria-labelledby="git-merges-heading" className="rounded-ui-md border border-border bg-surface p-4 shadow-ui-sm sm:p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 max-w-2xl">
          <h2 id="git-merges-heading" className="text-title font-semibold text-fg">
            {t.gitMergesTitle}
          </h2>
          <p className="mt-1 text-caption text-fg-muted">{t.gitMergesNote}</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t.gitMergesPeriod} className="w-40">
            <Select
              selectSize="sm"
              value={period}
              onChange={(e) => {
                if (!isMergePeriod(e.target.value)) return
                setPeriod(e.target.value)
                setCursors([])
              }}
            >
              {MERGE_PERIODS.map((p) => (
                <option key={p} value={p}>
                  {periodLabel(p)}
                </option>
              ))}
            </Select>
          </Field>
          {repositories.length > 1 && (
            <Field label={t.gitMergesRepo} className="w-56 max-w-full">
              <Select
                selectSize="sm"
                value={repositoryId}
                onChange={(e) => {
                  setChosenRepository(e.target.value)
                  setCursors([])
                }}
              >
                <option value="">{t.gitMergesRepoAll}</option>
                {repositories.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
      </div>

      <p role="status" className="sr-only">
        {status}
      </p>

      {query.error && (
        <div role="alert" className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-ui-sm border border-danger/30 bg-danger-soft px-3 py-2 text-caption text-fg">
          <span className="flex items-start gap-1.5">
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />
            <span>
              <span className="font-medium">{t.gitMergesLoadFailed}</span>
              {data && <span className="block text-fg-muted">{t.gitMergesStale}</span>}
            </span>
          </span>
          <Button variant="secondary" size="sm" onClick={query.refetch}>
            {t.errorRetry}
          </Button>
        </div>
      )}

      {!data ? (
        query.isLoading && <SkeletonTable rows={5} columns={COLUMNS} label={t.loading} />
      ) : data.items.length === 0 ? (
        <EmptyState
          compact
          icon={<GitMerge className="h-6 w-6" />}
          title={filtered ? t.gitMergesEmptyFiltered : t.gitMergesEmpty}
          description={filtered ? t.gitMergesEmptyFilteredDesc : t.gitMergesEmptyDesc}
        />
      ) : (
        // Keyboard users scroll the box itself when the table is wider than the screen (focus ring: globals.css).
        <div
          tabIndex={0}
          role="group"
          aria-labelledby="git-merges-heading"
          aria-busy={query.isFetching || undefined}
          className={cn("relative max-w-full overflow-x-auto rounded-ui-sm border border-border transition-opacity", query.isFetching && "opacity-60")}
        >
          <table className="w-full min-w-[72rem] border-collapse">
            <caption className="sr-only">{t.gitMergesCaption}</caption>
            <thead>
              <tr className="bg-surface-sunken">
                <th scope="col" className={cn(TH, "whitespace-nowrap")}>
                  {t.gitMergesColMergedAt}
                </th>
                <th scope="col" className={TH}>
                  {t.gitMergesColMr}
                </th>
                <th scope="col" className={TH}>
                  {t.gitMergesColSource}
                </th>
                <th scope="col" className={TH}>
                  {t.gitMergesColPbi}
                </th>
                <th scope="col" className={TH}>
                  {t.gitMergesColAuthor}
                </th>
                <th scope="col" className={TH}>
                  {t.gitMergesColMergedBy}
                </th>
                <th scope="col" className={TH}>
                  {t.gitMergesColTarget}
                </th>
                <th scope="col" className={cn(TH, "min-w-[7rem]")}>
                  {t.gitMergesColLead}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <MergeRow key={item.id} projectId={projectId} item={item} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(canNewer || older) && (
        <nav aria-label={t.gitMergesPager} className="mt-3 flex items-center justify-between gap-3">
          {/* aria-disabled (not disabled): the button keeps the focus while the next page loads. */}
          <Button
            variant="secondary"
            size="sm"
            aria-disabled={canNewer ? undefined : true}
            leftIcon={<ChevronLeft aria-hidden="true" className="h-4 w-4" />}
            onClick={() => canNewer && setCursors((stack) => stack.slice(0, -1))}
          >
            {t.gitMergesNewer}
          </Button>
          <p className="text-caption tabular-nums text-fg-muted">{fillTemplate(t.gitMergesPage, { n: pageNumber })}</p>
          <Button
            variant="secondary"
            size="sm"
            aria-disabled={older ? undefined : true}
            rightIcon={<ChevronRight aria-hidden="true" className="h-4 w-4" />}
            onClick={() => older && setCursors((stack) => [...stack, older])}
          >
            {t.gitMergesOlder}
          </Button>
        </nav>
      )}
    </section>
  )
}

/** "—" for a value Kanflow does not know, spoken as "unknown". */
function Unknown() {
  const { t } = useLanguage()
  return (
    <>
      <span aria-hidden="true" className="text-fg-muted">
        —
      </span>
      <span className="sr-only">{t.gitMergesUnknown}</span>
    </>
  )
}

function leadText(lead: LeadTime, t: Translations): string {
  if (lead.unit === "underHour") return t.gitMergesLeadUnderHour
  if (lead.unit === "hours") return lead.n === 1 ? t.gitMergesLeadHour : fillTemplate(t.gitMergesLeadHours, { n: lead.n })
  return fillTemplate(t.gitMergesLeadDays, { n: lead.n })
}

function MergeRow({ projectId, item }: { projectId: string; item: MergeHistoryItemDto }) {
  const { t, language } = useLanguage()
  const title = item.title || `!${item.ref}`
  const lead = leadTime(item.openedAt, item.mergedAt)
  const titleClass = "break-words text-body font-medium text-fg"
  // Repository · !ref · source branch, without a stray separator for an unknown part.
  const source = [item.repository.name, `!${item.ref}`, item.sourceBranch].filter((part): part is string => Boolean(part))

  return (
    <tr className="border-t border-border align-top">
      <td className={cn(TD, "whitespace-nowrap tabular-nums")}>
        <time dateTime={item.mergedAt}>{formatDateTime(item.mergedAt, language)}</time>
      </td>
      {/* The row header holds the title only: screen readers repeat it in every cell of the row. */}
      <th scope="row" className="min-w-[14rem] px-3 py-2.5 text-left font-normal">
        {isWebUrl(item.url) ? (
          <a href={item.url} target="_blank" rel="noopener noreferrer" className={cn(titleClass, "hover:text-primary hover:underline")}>
            {title}
            <ExternalLink aria-hidden="true" className="ml-1 inline h-3.5 w-3.5 align-[-2px]" />
            <span className="sr-only"> ({t.gitMergesOpenMr})</span>
          </a>
        ) : (
          <span className={titleClass}>{title}</span>
        )}
      </th>
      <td className={cn(TD, "min-w-[12rem] text-fg-muted")}>
        {source.map((part, i) => (
          <span key={i} className={cn("break-all", i === source.length - 1 && item.sourceBranch === part && "font-mono")}>
            {i > 0 && (
              <span aria-hidden="true" className="mx-1.5">
                ·
              </span>
            )}
            {part}
          </span>
        ))}
      </td>
      <td className={cn(TD, "max-w-[16rem]")}>
        {item.pbis.length === 0 ? (
          <Unknown />
        ) : (
          <ul className="flex flex-col items-start gap-1">
            {item.pbis.map((pbi) => {
              const key = pbiKey(pbi.displayId)
              const open = fillTemplate(t.gitPageOpenPbi, { key })
              return (
                <li key={pbi.id} className="max-w-full">
                  <Link
                    href={`/projects/${projectId}/backlog?pbi=${pbi.displayId}`}
                    aria-label={pbi.title ? `${open}: ${pbi.title}` : open}
                    title={pbi.title || undefined}
                    className="inline-flex min-h-6 max-w-full items-center gap-1.5 rounded-ui-sm bg-primary-soft px-2 py-0.5 text-caption text-primary-active hover:underline"
                  >
                    <span className="shrink-0 font-semibold">{key}</span>
                    {pbi.title && <span className="truncate">{pbi.title}</span>}
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </td>
      <td className={cn(TD, "break-words")}>{item.author ?? <Unknown />}</td>
      <td className={cn(TD, "break-words")}>{item.mergedBy ?? <Unknown />}</td>
      <td className={TD}>{item.targetBranch ? <span className="break-all font-mono">{item.targetBranch}</span> : <Unknown />}</td>
      <td className={cn(TD, "whitespace-nowrap tabular-nums")}>{lead ? leadText(lead, t) : <Unknown />}</td>
    </tr>
  )
}
