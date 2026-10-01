"use client"

import { useId, useState } from "react"
import { CircleCheck, Hourglass, Plus, X } from "lucide-react"
import { Button, IconButton, cn, useToast } from "@/components/ui"
import { apiFetch } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import { isRefDone, refLabel, type PickMode } from "@/lib/pbi-dependencies"
import type { PbiDependencyRefDto } from "@/types/api"
import { PbiDependencyPicker } from "./pbi-dependency-picker"

interface Props {
  projectId: string
  item: { id: string; displayId: number; blockedBy?: PbiDependencyRefDto[]; blocking?: PbiDependencyRefDto[] }
  /** Label of the PBI ("#12 title") for the picker's description. */
  label: string
  canEdit: boolean
  /** After a link was added / removed (reload the PBI and the list behind it). */
  onChanged: () => void
  /** Open another PBI (the rows are links). */
  onOpenRef?: (ref: PbiDependencyRefDto) => void
}

const errMessage = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback)

/**
 * "Finish first" / "waiting for this" lists of a PBI with add (picker) and
 * remove. Writes apply immediately — no need to enter the edit form.
 */
export function PbiDependencySection({ projectId, item, label, canEdit, onChanged, onOpenRef }: Props) {
  const { t } = useLanguage()
  const toast = useToast()
  const headingId = useId()
  const [picking, setPicking] = useState<PickMode | null>(null)
  const [busy, setBusy] = useState(false)
  const base = `/api/projects/${projectId}/backlog/dependencies`

  async function write(run: () => Promise<unknown>, ok: string, failed: string) {
    setBusy(true)
    try {
      await run()
      toast.success(ok)
    } catch (err) {
      toast.error(errMessage(err, failed), { title: failed })
    } finally {
      setBusy(false)
      onChanged()
    }
  }

  function add(otherId: string) {
    const mode = picking
    setPicking(null)
    if (!mode) return
    const json = mode === "blockedBy" ? { predecessorId: otherId, successorId: item.id } : { predecessorId: item.id, successorId: otherId }
    void write(() => apiFetch(base, { method: "POST", json }), t.depAdded, t.depAddFailed)
  }

  function remove(ref: PbiDependencyRefDto) {
    void write(() => apiFetch(`${base}/${ref.dependencyId}`, { method: "DELETE" }), t.depRemoved, t.depRemoveFailed)
  }

  return (
    <section aria-labelledby={headingId} className="space-y-3 rounded-ui-md border border-border p-3" data-pbi-dependencies="">
      <div>
        <h3 id={headingId} className="text-body font-semibold text-fg">{t.depSectionTitle}</h3>
        <p className="text-caption text-fg-muted">{t.depSectionHint}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <RefList
          title={t.depBlockedByTitle}
          hint={t.depBlockedByHint}
          refs={item.blockedBy ?? []}
          canEdit={canEdit}
          busy={busy}
          addLabel={t.depAddBlockedBy}
          onAdd={() => setPicking("blockedBy")}
          onRemove={remove}
          onOpenRef={onOpenRef}
        />
        <RefList
          title={t.depBlockingTitle}
          hint={t.depBlockingHint}
          refs={item.blocking ?? []}
          canEdit={canEdit}
          busy={busy}
          addLabel={t.depAddBlocking}
          onAdd={() => setPicking("blocking")}
          onRemove={remove}
          onOpenRef={onOpenRef}
        />
      </div>
      {picking && <PbiDependencyPicker projectId={projectId} self={{ id: item.id, label }} mode={picking} onPick={add} onClose={() => setPicking(null)} />}
    </section>
  )
}

interface RefListProps {
  title: string
  hint: string
  refs: readonly PbiDependencyRefDto[]
  canEdit: boolean
  busy: boolean
  addLabel: string
  onAdd: () => void
  onRemove: (ref: PbiDependencyRefDto) => void
  onOpenRef?: (ref: PbiDependencyRefDto) => void
}

function RefList({ title, hint, refs, canEdit, busy, addLabel, onAdd, onRemove, onOpenRef }: RefListProps) {
  const { t, language } = useLanguage()
  return (
    <div className="space-y-1.5">
      <div>
        <p className="text-caption font-medium text-fg">{title}</p>
        <p className="text-caption text-fg-muted">{hint}</p>
      </div>
      {refs.length === 0 ? (
        <p className="rounded-ui-sm bg-surface-muted px-2 py-1.5 text-caption text-fg-subtle">{t.depNone}</p>
      ) : (
        <ul className="space-y-1">
          {refs.map((ref) => {
            const name = refLabel(ref, language)
            const done = isRefDone(ref)
            return (
              <li key={ref.dependencyId} className="flex items-center gap-2 rounded-ui-sm bg-surface-muted px-2 py-1 text-body">
                {done ? (
                  <CircleCheck aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-success" />
                ) : (
                  <Hourglass aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-warning" />
                )}
                <span className="sr-only">{done ? t.depStatusDone : t.depStatusWaiting}</span>
                {onOpenRef ? (
                  <button type="button" onClick={() => onOpenRef(ref)} className={cn("min-w-0 flex-1 truncate text-left hover:underline", done ? "text-fg-muted" : "text-fg")} title={name}>
                    {name}
                  </button>
                ) : (
                  <span className={cn("min-w-0 flex-1 truncate", done ? "text-fg-muted" : "text-fg")} title={name}>{name}</span>
                )}
                {canEdit && <IconButton size="sm" label={t.depRemove.replace("{name}", name)} icon={<X className="h-4 w-4" />} disabled={busy} onClick={() => onRemove(ref)} />}
              </li>
            )
          })}
        </ul>
      )}
      {canEdit && (
        <Button size="sm" variant="ghost" leftIcon={<Plus className="h-4 w-4" />} disabled={busy} onClick={onAdd}>
          {addLabel}
        </Button>
      )}
    </div>
  )
}
