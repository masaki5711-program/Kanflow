"use client"

import { useId, useState } from "react"
import { Plus } from "lucide-react"
import { fillTemplate } from "@/lib/fill-template"
import { useLanguage } from "@/lib/language-context"
import { apiFetch, useApiMutation, useApiQuery } from "@/hooks"
import { Button, cn, useConfirm } from "@/components/ui"
import { EvidenceMark } from "./ac-evidence"
import { AcForm, EMPTY_AC_FORM, toAcBody, toAcForm, type AcDto, type AcFormValues } from "./ac-form"

interface AcList {
  data: AcDto[]
  /** backlog.write on the server (PO / SM / admin): add / edit / delete controls. */
  canEdit: boolean
}

function parseList(raw: unknown): AcList {
  const r = raw as Partial<AcList> | null
  return { data: Array.isArray(r?.data) ? r.data : [], canEdit: r?.canEdit === true }
}

interface Props {
  projectId: string
  pbiId: string
  /** The old free-text field (deprecated, read-only): shown folded below the items. */
  legacyText?: string | null
  className?: string
}

/**
 * 受入基準 checklist of a PBI (W5): one row per item with its stable id (PBI-12/AC-2), the
 * Given / When / Then (or free text) and the evidence kind (icon + text; gray while not decided).
 * PO / SM / admin (`canEdit` from the server) add, edit and delete; everyone else reads.
 */
export function PbiAcceptanceCriteria({ projectId, pbiId, legacyText, className }: Props) {
  const { t, pt } = useLanguage()
  const headingId = useId()
  const base = `/api/projects/${projectId}/backlog/${pbiId}/acceptance-criteria`
  const { data, error, refetch } = useApiQuery<AcList>(base, { parse: parseList })
  const [editing, setEditing] = useState<number | "new" | null>(null)

  const save = useApiMutation(
    ({ seq, values }: { seq: number | "new"; values: AcFormValues }) =>
      seq === "new"
        ? apiFetch(base, { method: "POST", json: toAcBody(values) })
        : apiFetch(`${base}/AC-${seq}`, { method: "PATCH", json: toAcBody(values) }),
    {
      toastOnSuccess: t.pbiAcSaved,
      toastOnError: () => t.pbiAcSaveFailed,
      onSuccess: () => {
        setEditing(null)
        refetch()
      },
    },
  )

  const legacy = legacyText?.trim() ? legacyText : null
  const items = data?.data ?? []

  return (
    <section aria-labelledby={headingId} className={cn("space-y-2", className)} data-pbi-acceptance-criteria="">
      <h3 id={headingId} className="text-caption font-medium text-fg-muted">{pt.backlogAcceptanceCriteria}</h3>
      {!data && error && <p role="alert" className="rounded-ui-sm bg-surface-muted px-2 py-1.5 text-caption text-fg-muted">{t.pbiAcLoadFailed}</p>}
      {data && items.length === 0 && editing !== "new" && <p className="rounded-ui-md bg-surface-muted px-3 py-2 text-body text-fg-subtle">{t.pbiAcEmpty}</p>}
      {items.length > 0 && (
        <ul className="divide-y divide-border rounded-ui-md border border-border">
          {items.map((ac) =>
            editing === ac.seq ? (
              <li key={ac.seq} className="p-2">
                <AcForm
                  initial={toAcForm(ac)}
                  saving={save.isPending}
                  legend={fillTemplate(t.pbiAcEditLabel, { id: ac.id })}
                  onSubmit={(values) => void save.mutate({ seq: ac.seq, values })}
                  onCancel={() => setEditing(null)}
                />
              </li>
            ) : (
              <AcRow key={ac.seq} ac={ac} canEdit={!!data?.canEdit} disabled={editing !== null} onEdit={() => setEditing(ac.seq)} onChanged={refetch} base={base} />
            ),
          )}
        </ul>
      )}
      {data?.canEdit && (
        editing === "new" ? (
          <AcForm
            initial={EMPTY_AC_FORM}
            saving={save.isPending}
            legend={t.pbiAcAdd}
            onSubmit={(values) => void save.mutate({ seq: "new", values })}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <Button type="button" variant="secondary" size="sm" disabled={editing !== null} onClick={() => setEditing("new")}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {t.pbiAcAdd}
          </Button>
        )
      )}
      {legacy && (
        <details className="rounded-ui-md border border-dashed border-border px-3 py-2" open={items.length === 0 && !!data} data-ac-legacy="">
          <summary className="cursor-pointer text-caption text-fg-muted">{t.pbiAcLegacyTitle}</summary>
          <p className="mt-1 text-caption text-fg-subtle">{t.pbiAcLegacyHint}</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-body text-fg">{legacy}</p>
        </details>
      )}
    </section>
  )
}

function AcRow({ ac, canEdit, disabled, onEdit, onChanged, base }: { ac: AcDto; canEdit: boolean; disabled: boolean; onEdit: () => void; onChanged: () => void; base: string }) {
  const { t } = useLanguage()
  const confirm = useConfirm()
  const remove = useApiMutation(() => apiFetch(`${base}/AC-${ac.seq}`, { method: "DELETE" }), {
    toastOnSuccess: t.pbiAcDeleted,
    toastOnError: () => t.pbiAcDeleteFailed,
    onSuccess: onChanged,
  })

  async function onDelete() {
    const ok = await confirm({
      title: t.pbiAcDeleteConfirmTitle,
      message: fillTemplate(t.pbiAcDeleteConfirmMessage, { id: ac.id }),
      confirmLabel: t.delete,
      variant: "danger",
    })
    if (ok) await remove.mutate(undefined)
  }

  const parts: Array<[string, string | null]> = [
    [t.pbiAcGiven, ac.given],
    [t.pbiAcWhen, ac.when],
    [t.pbiAcThen, ac.then],
  ]
  return (
    <li className="flex flex-wrap items-start gap-x-3 gap-y-1 p-2" data-ac-row={ac.id}>
      <span className="shrink-0 rounded-ui-sm bg-surface-sunken px-1.5 py-0.5 font-mono text-caption text-fg-muted">{ac.id}</span>
      <div className="min-w-0 flex-1 space-y-1">
        {parts.some(([, v]) => v) && (
          <dl className="space-y-0.5 text-body text-fg">
            {parts.map(([label, value]) =>
              value ? (
                <div key={label} className="flex gap-2">
                  <dt className="shrink-0 font-medium text-fg-muted">{label}</dt>
                  <dd className="min-w-0 whitespace-pre-wrap break-words">{value}</dd>
                </div>
              ) : null,
            )}
          </dl>
        )}
        {ac.text && <p className="whitespace-pre-wrap break-words text-body text-fg">{ac.text}</p>}
        <EvidenceMark kind={ac.evidenceKind} t={t} />
      </div>
      {canEdit && (
        <div className="flex gap-1">
          <Button type="button" variant="ghost" size="sm" disabled={disabled} aria-label={fillTemplate(t.pbiAcEditLabel, { id: ac.id })} onClick={onEdit}>{t.edit}</Button>
          <Button type="button" variant="ghost" size="sm" disabled={disabled} loading={remove.isPending} aria-label={fillTemplate(t.pbiAcDeleteLabel, { id: ac.id })} onClick={() => void onDelete()}>{t.delete}</Button>
        </div>
      )}
    </li>
  )
}
