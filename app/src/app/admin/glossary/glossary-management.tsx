"use client"

import { useEffect, useState } from "react"
import { useLanguage } from "@/lib/language-context"
import { apiFetch, useApiQuery } from "@/hooks"
import { Button, Input, SkeletonTable, VisuallyHidden, useToast, useConfirm, PageHeader } from "@/components/ui"
import type { GlossaryEntry, TranslationLocale } from "@/lib/translation/types"
import { GlossaryInlineEdit } from "./glossary-inline-edit"
import { GlossaryAddForm } from "./glossary-add-form"
import { isSearchChange, pagerInfo, resolveTotal, type KnownTotal } from "./glossary-paging"
import { useDocumentTitle } from "@/hooks/use-document-title"

const PAGE = 50
const SEARCH_DEBOUNCE_MS = 300

interface GlossaryPage {
  data: GlossaryEntry[]
  total: number
}

type RowPatch = { term?: string; translation?: string; note?: string | null }

/**
 * /admin/glossary: direction tabs, search, add, inline edit, delete,
 * "re-translate texts containing this term", notation help.
 */
export function GlossaryManagement() {
  const { t } = useLanguage()
  useDocumentTitle([t.glossaryTitle])
  const confirm = useConfirm()
  const toast = useToast()
  const [source, setSource] = useState<TranslationLocale>("ja")
  const [q, setQ] = useState("")
  const [debouncedQ, setDebouncedQ] = useState("")
  const [offset, setOffset] = useState(0)
  const [busy, setBusy] = useState(false)

  // Search: 300 ms debounce, then back to page 1 — only when the query really
  // changed (the mount-time run used to reset a page change made meanwhile).
  useEffect(() => {
    if (!isSearchChange(q, debouncedQ)) return
    const id = setTimeout(() => {
      setDebouncedQ(q.trim())
      setOffset(0)
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [q, debouncedQ])

  const params = new URLSearchParams({ source, limit: String(PAGE), offset: String(offset) })
  if (debouncedQ) params.set("q", debouncedQ)
  const { data, isLoading, isFetching, refetch, mutate } = useApiQuery<GlossaryPage>(`/api/admin/glossary?${params}`, {
    toastOnError: true,
  })
  const rows = data?.data ?? []
  // Keep the last known total of this result set while another page loads,
  // so the pager / summary stay visible (adjusting state during render).
  const totalKey = `${source}|${debouncedQ}`
  const [knownTotal, setKnownTotal] = useState<KnownTotal | null>(null)
  if (data && (knownTotal?.key !== totalKey || knownTotal.total !== data.total)) {
    setKnownTotal({ key: totalKey, total: data.total })
  }
  const total = resolveTotal(data?.total, knownTotal, totalKey)

  function errorToast(err: unknown) {
    toast.error(err instanceof Error ? err.message : t.error)
  }

  async function commit(row: GlossaryEntry, patch: RowPatch) {
    const changed =
      (patch.term !== undefined && patch.term !== row.term) ||
      (patch.translation !== undefined && patch.translation !== row.translation) ||
      (patch.note !== undefined && (patch.note ?? "") !== (row.note ?? ""))
    if (!changed) return
    const before = data
    const replaceRow = (next: GlossaryEntry) => (page: GlossaryPage | undefined) =>
      page && { ...page, data: page.data.map((r) => (r.id === row.id ? next : r)) }
    mutate(replaceRow({ ...row, ...patch, note: patch.note === undefined ? row.note : patch.note }))
    try {
      const updated = await apiFetch<GlossaryEntry>(`/api/admin/glossary/${row.id}`, { method: "PATCH", json: patch })
      // Inline edit: the saved value stays in place — no success toast.
      mutate(replaceRow(updated))
    } catch (err) {
      mutate(before)
      errorToast(err)
    }
  }

  async function remove(row: GlossaryEntry) {
    const ok = await confirm({
      message: t.glossaryDeleteConfirm.replace("{term}", row.term),
      confirmLabel: t.delete,
      cancelLabel: t.cancel,
      variant: "danger",
    })
    if (!ok) return
    setBusy(true)
    try {
      await apiFetch(`/api/admin/glossary/${row.id}`, { method: "DELETE" })
      toast.success(t.glossaryDeleted)
      refetch()
    } catch (err) {
      errorToast(err)
    } finally {
      setBusy(false)
    }
  }

  async function retranslate(ids?: string[]) {
    setBusy(true)
    try {
      const res = await apiFetch<{ requeued: number }>("/api/admin/glossary", { method: "PUT", json: { ids } })
      toast.success(t.glossaryRetranslateQueued.replace("{count}", String(res.requeued)))
    } catch (err) {
      errorToast(err)
    } finally {
      setBusy(false)
    }
  }

  function switchSource(s: TranslationLocale) {
    setSource(s)
    setOffset(0)
  }

  const { page, pages, hasPrev, hasNext } = pagerInfo(offset, total, PAGE)

  return (
    <div className="space-y-4">
      <PageHeader title={t.glossaryTitle} description={t.glossaryHelp} className="mb-0" />
      <div className="bg-surface rounded-ui-md shadow-ui-sm border border-border">
        <div className="bg-surface-muted px-5 py-3 text-body rounded-ui-md">
          <p className="font-medium text-fg">{t.glossaryNotationTitle}</p>
          <ul className="mt-1 space-y-1 text-fg-muted">
            <li>
              <code className="rounded bg-surface px-1 font-mono text-fg">改善&lt;&lt;KAIZEN&gt;&gt;</code> {t.glossaryNotationBasic}
            </li>
            <li>
              <code className="rounded bg-surface px-1 font-mono text-fg">&lt;&lt;生産技術|Teknik Produksi&gt;&gt;</code> {t.glossaryNotationExplicit}
            </li>
            <li>{t.glossaryNotationOverwrite}</li>
            <li>{t.glossaryNotationReverse}</li>
          </ul>
        </div>
      </div>

      <div className="bg-surface rounded-ui-md shadow-ui-sm border border-border">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          {/* Direction toggle: a pressed-button group (it filters the one table below, no tab panels). */}
          <div role="group" aria-label={t.glossaryDirection} className="inline-flex overflow-hidden rounded-ui-sm border border-border-strong">
            {(["ja", "id"] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={source === s}
                onClick={() => switchSource(s)}
                className={`min-h-9 px-3 py-1.5 text-body font-medium ${
                  source === s ? "bg-primary text-primary-fg" : "bg-surface text-fg-muted hover:bg-surface-muted"
                }`}
              >
                {s === "ja" ? t.glossaryTabJa : t.glossaryTabId}
              </button>
            ))}
          </div>
          <Input
            type="search"
            inputSize="sm"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t.glossarySearchPlaceholder}
            aria-label={t.glossarySearch}
            className="min-w-[12rem] flex-1 sm:max-w-xs"
          />
          <span className="text-body text-fg-muted" aria-live="polite">
            {t.glossarySummary.replace("{total}", String(total))}
          </span>
          <Button variant="secondary" size="sm" onClick={() => retranslate()} disabled={busy || total === 0}>
            {t.glossaryRetranslateAll}
          </Button>
        </div>

        <GlossaryAddForm source={source} onAdded={() => (offset === 0 ? refetch() : setOffset(0))} />

        <div className="overflow-x-auto" aria-busy={isFetching}>
          {isLoading ? (
            <SkeletonTable rows={6} columns={5} label={t.glossaryLoading} />
          ) : (
            <table className="w-full text-body">
              <caption>
                <VisuallyHidden>{t.glossaryTitle}</VisuallyHidden>
              </caption>
              <thead>
                <tr className="border-b border-border text-left text-caption uppercase tracking-wide text-fg-muted">
                  <th scope="col" className="px-4 py-2 font-medium">{t.glossaryColTerm}</th>
                  <th scope="col" className="px-2 py-2 font-medium">{t.glossaryColTranslation}</th>
                  <th scope="col" className="px-2 py-2 font-medium">{t.glossaryColNote}</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">{t.glossaryColUsage}</th>
                  <th scope="col" className="px-2 py-2 font-medium">{t.glossaryColActions}</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-fg-muted">
                      {t.glossaryEmpty}
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id} className="border-b border-border hover:bg-surface-muted">
                      <td className="px-4 py-1.5" lang={source}>
                        <div className="flex items-center gap-1">
                          <GlossaryInlineEdit value={row.term} onCommit={(v) => commit(row, { term: v })} label={t.glossaryColTerm} />
                          {row.autoReverse && (
                            <span className="text-caption text-fg-subtle" title={t.glossaryAutoReverseHint}>
                              <span aria-hidden>⇄</span>
                              <VisuallyHidden>{t.glossaryAutoReverseHint}</VisuallyHidden>
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1.5" lang={source === "ja" ? "id" : "ja"}>
                        <GlossaryInlineEdit value={row.translation} onCommit={(v) => commit(row, { translation: v })} label={t.glossaryColTranslation} />
                      </td>
                      <td className="px-2 py-1.5">
                        <GlossaryInlineEdit
                          value={row.note ?? ""}
                          onCommit={(v) => commit(row, { note: v.trim() ? v : null })}
                          label={t.glossaryColNote}
                          placeholder="—"
                          allowEmpty
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums text-fg-muted">{row.usageCount}</td>
                      <td className="px-2 py-1.5">
                        <div className="flex flex-wrap gap-1">
                          <Button variant="secondary" size="sm" onClick={() => retranslate([row.id])} disabled={busy} title={t.glossaryRetranslateOneHint}>
                            {t.glossaryRetranslateOne}
                          </Button>
                          <Button variant="danger" size="sm" onClick={() => remove(row)} disabled={busy}>
                            {t.delete}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        {pages > 1 && (
          <nav aria-label={t.glossaryTitle} className="flex items-center justify-between border-t border-border px-4 py-3">
            <Button variant="secondary" size="sm" disabled={!hasPrev || isFetching} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
              ← {t.glossaryPrev}
            </Button>
            <span className="text-body text-fg-muted">
              {page} / {pages}
            </span>
            <Button variant="secondary" size="sm" disabled={!hasNext || isFetching} onClick={() => setOffset(offset + PAGE)}>
              {t.glossaryNext} →
            </Button>
          </nav>
        )}
      </div>
    </div>
  )
}
