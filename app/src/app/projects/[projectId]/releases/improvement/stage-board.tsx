"use client"

import { useId, useMemo, useState } from "react"
import { DisclosureChevron } from "@/components/ui"
import { BOARD_STAGES, KAIZEN_STAGES } from "@/lib/improvement/constants"
import { stageHint, stageLabel } from "@/lib/improvement/labels"
import { useLanguage } from "@/lib/language-context"
import { ImprovementCard } from "./improvement-card"
import { groupByStage, type ImprovementItem } from "./improvement-types"
import { stageStyle } from "./stage-style"

interface Props {
  projectId: string
  items: readonly ImprovementItem[]
  onOpen: (id: string) => void
}

/**
 * Stage columns 効果確認中 → 標準化済み → 横展開中 → 定着確認済み (stacked on
 * phones, side by side from lg), with 延期 collapsed underneath.
 */
export function StageBoard({ projectId, items, onOpen }: Props) {
  const { t } = useLanguage()
  const groups = useMemo(() => groupByStage(items, KAIZEN_STAGES), [items])
  const deferred = groups.get("deferred") ?? []

  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {BOARD_STAGES.map((stage) => (
          <StageColumn key={stage} stage={stage} items={groups.get(stage) ?? []} projectId={projectId} onOpen={onOpen} />
        ))}
      </div>
      {deferred.length > 0 && <DeferredGroup items={deferred} projectId={projectId} onOpen={onOpen} label={t.kzDeferredSection.replace("{n}", String(deferred.length))} />}
    </>
  )
}

interface ColumnProps {
  stage: string
  items: readonly ImprovementItem[]
  projectId: string
  onOpen: (id: string) => void
}

function StageColumn({ stage, items, projectId, onOpen }: ColumnProps) {
  const { t } = useLanguage()
  const headingId = useId()
  const style = stageStyle(stage)
  return (
    <section aria-labelledby={headingId} className={`flex flex-col rounded-ui-lg border border-border border-t-4 bg-surface-muted ${style.bar}`}>
      <header className="px-3 pb-2 pt-3">
        <h2 id={headingId} className="flex items-center gap-2 text-body font-semibold text-fg">
          {stageLabel(stage, t)}
          <span className={`rounded-full px-2 py-0.5 text-caption font-bold tabular-nums ${style.chip}`}>{items.length}</span>
        </h2>
        <p className="mt-0.5 text-caption text-fg-muted">{stageHint(stage, t)}</p>
      </header>
      {items.length === 0 ? (
        <p className="mx-3 mb-3 rounded-ui-md border border-dashed border-border px-3 py-4 text-center text-caption text-fg-muted">{t.kzColumnEmpty}</p>
      ) : (
        <ul className="flex flex-col gap-2 px-3 pb-3">
          {items.map((item) => (
            <li key={item.id}>
              <ImprovementCard projectId={projectId} item={item} onOpen={onOpen} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function DeferredGroup({ items, projectId, onOpen, label }: { items: readonly ImprovementItem[]; projectId: string; onOpen: (id: string) => void; label: string }) {
  const [open, setOpen] = useState(false)
  const listId = useId()
  return (
    <section className="mt-6 border-t border-border pt-4">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 items-center gap-2 rounded-ui-sm text-body text-fg-muted hover:text-fg"
      >
        <DisclosureChevron open={open} />
        {label}
      </button>
      {open && (
        <ul id={listId} className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
          {items.map((item) => (
            <li key={item.id}>
              <ImprovementCard projectId={projectId} item={item} onOpen={onOpen} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
