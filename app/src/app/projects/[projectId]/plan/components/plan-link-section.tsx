"use client"

import { forwardRef, useId } from "react"
import Link from "next/link"
import { AlertTriangle, Link2, Search, X } from "lucide-react"
import { IconButton, Input, Spinner } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { fillTemplate } from "../lib/template"
import { linkPlanName, linkTitle } from "./link-label"
import type { PlanLinksState } from "../hooks/use-plan-links"

interface Props {
  links: PlanLinksState
  itemId: string
  disabled: boolean
  /** Backlog filtered to this item's PBIs (?plan=). */
  backlogHref: string
}

/**
 * "Link PBIs" section of the editor (leaf items): the current selection and a
 * search over linkable PBIs. PBIs linked to another plan item show where they
 * come from — saving moves them here.
 */
export const PlanLinkSection = forwardRef<HTMLElement, Props>(function PlanLinkSection({ links, itemId, disabled, backlogHref }, ref) {
  const { t, language } = useLanguage()
  const headingId = useId()
  const resultsId = useId()
  return (
    <section ref={ref} tabIndex={-1} aria-labelledby={headingId} className="space-y-3 rounded-ui-md border border-border p-3">
      <h3 id={headingId} className="flex items-center gap-1.5 text-body font-semibold text-fg">
        <Link2 aria-hidden="true" className="h-4 w-4 text-fg-muted" />
        {t.planLinkSection}
        <span className="text-caption font-normal text-fg-muted">({links.selectedIds.length})</span>
        {links.chosen.length > 0 && (
          <Link href={backlogHref} className="ml-auto text-caption font-normal text-primary-strong underline-offset-2 hover:underline">
            {t.planLinkOpenBacklog}
          </Link>
        )}
      </h3>

      {links.isLoading ? (
        <Spinner size="sm" label={t.loading} />
      ) : links.chosen.length === 0 ? (
        <p className="text-caption text-fg-muted">{t.planLinkNone}</p>
      ) : (
        <ul className="space-y-1">
          {links.chosen.map((p) => (
            <li key={p.id} className="flex items-center gap-2 rounded-ui-sm bg-surface-muted px-2 py-1 text-body">
              <span className="font-mono text-caption text-fg-muted">#{p.displayId}</span>
              <span className="min-w-0 flex-1 truncate text-fg" title={linkTitle(p, language)}>{linkTitle(p, language)}</span>
              {!disabled && (
                <IconButton size="sm" label={`${t.planLinkUnlink}: #${p.displayId}`} icon={<X className="h-4 w-4" />} onClick={() => links.toggle(p)} />
              )}
            </li>
          ))}
        </ul>
      )}

      {links.moving.length > 0 && (
        <p role="status" className="flex items-start gap-1.5 rounded-ui-sm bg-warning-soft px-2 py-1.5 text-caption text-warning-strong">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {fillTemplate(t.planLinkMoveSummary, { count: links.moving.length })}
        </p>
      )}

      {!disabled && (
        <div className="space-y-2">
          <label className="relative block">
            <span className="sr-only">{t.planLinkSearch}</span>
            <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
            <Input
              type="search"
              inputSize="sm"
              value={links.query}
              placeholder={t.planLinkSearch}
              aria-controls={resultsId}
              onChange={(e) => links.setQuery(e.target.value)}
              className="pl-8"
            />
          </label>
          <ul id={resultsId} aria-busy={links.isSearching} className="max-h-56 space-y-0.5 overflow-auto">
            {links.results.length === 0 && !links.isSearching && <li className="px-2 py-1 text-caption text-fg-muted">{t.planLinkNoResults}</li>}
            {links.results.map((p) => {
              const elsewhere = p.planItem && p.planItem.id !== itemId ? p.planItem : null
              return (
                <li key={p.id}>
                  <label className="flex min-h-9 cursor-pointer items-start gap-2 rounded-ui-sm px-2 py-1 hover:bg-surface-muted">
                    <input type="checkbox" className="mt-1 h-4 w-4" checked={links.selectedIds.includes(p.id)} onChange={() => links.toggle(p)} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-body text-fg">
                        <span className="font-mono text-caption text-fg-muted">#{p.displayId}</span>
                        <span className="truncate" title={linkTitle(p, language)}>{linkTitle(p, language)}</span>
                      </span>
                      {elsewhere && (
                        <span className="flex items-center gap-1 text-caption text-warning-strong">
                          <AlertTriangle aria-hidden="true" className="h-3 w-3" />
                          {fillTemplate(t.planLinkMoveWarning, { name: linkPlanName(elsewhere, language) })}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </section>
  )
})
