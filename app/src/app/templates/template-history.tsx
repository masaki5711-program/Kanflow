"use client"

import { useState } from "react"
import { History } from "lucide-react"
import { Button, Modal, SkeletonLines } from "@/components/ui"
import { useApiQuery } from "@/hooks"
import { fillTemplate } from "@/lib/fill-template"
import { useLanguage } from "@/lib/language-context"
import type { Translations } from "@/lib/i18n"
import { TemplateStageTree } from "@/components/plan-templates/template-stage-tree"
import { TEMPLATES_API, type TemplateRevisionDto } from "@/components/plan-templates/template-groups"

interface Props {
  templateId: string
  /** Changes after every save so the list reloads. */
  version: number
}

export function actionLabel(t: Translations, action: string): string {
  switch (action) {
    case "create":
      return t.tplHistoryCreate
    case "reset":
      return t.tplHistoryReset
    case "duplicate":
      return t.tplHistoryDuplicate
    default:
      return t.tplHistoryUpdate
  }
}

/** 変更履歴: who / when / what kind of change, each version viewable read-only. */
export function TemplateHistory({ templateId, version }: Props) {
  const { t, language } = useLanguage()
  const [viewId, setViewId] = useState<string | null>(null)
  const list = useApiQuery<TemplateRevisionDto[]>(`${TEMPLATES_API}/${templateId}/revisions?v=${version}`)
  const one = useApiQuery<TemplateRevisionDto[]>(viewId ? `${TEMPLATES_API}/${templateId}/revisions?revisionId=${encodeURIComponent(viewId)}` : null)
  const viewed = one.data?.[0]?.id === viewId ? one.data[0] : null
  const fmt = (iso: string) => new Date(iso).toLocaleString(language, { dateStyle: "medium", timeStyle: "short" })

  return (
    <section aria-labelledby="tpl-history-title" className="space-y-2 rounded-ui-lg border border-border bg-surface p-4">
      <h2 id="tpl-history-title" className="flex items-center gap-1.5 text-body font-semibold text-fg">
        <History aria-hidden="true" className="h-4 w-4 text-fg-muted" />
        {t.tplHistory}
      </h2>
      {list.isLoading ? (
        <SkeletonLines lines={3} />
      ) : (list.data ?? []).length === 0 ? (
        <p className="text-caption text-fg-muted">{t.tplHistoryEmpty}</p>
      ) : (
        <ol className="max-h-96 space-y-1 overflow-y-auto" data-testid="tpl-history">
          {(list.data ?? []).map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-2 rounded-ui-sm px-1 py-1 text-caption text-fg hover:bg-surface-muted">
              <span className="min-w-0 flex-1">
                {fillTemplate(t.tplHistoryEntry, { date: fmt(r.editedAt), name: r.editedBy?.name ?? t.tplSystemUser, action: actionLabel(t, r.action) })}
              </span>
              <Button variant="link" size="sm" onClick={() => setViewId(r.id)}>
                {t.tplHistoryView}
              </Button>
            </li>
          ))}
        </ol>
      )}
      {viewId && (
        <Modal
          open
          onClose={() => setViewId(null)}
          size="lg"
          title={viewed ? `${viewed.name} · ${fillTemplate(t.tplHistoryVersion, { n: viewed.version })}` : t.tplHistory}
          description={viewed ? fillTemplate(t.tplHistoryEntry, { date: fmt(viewed.editedAt), name: viewed.editedBy?.name ?? t.tplSystemUser, action: actionLabel(t, viewed.action) }) : undefined}
        >
          {viewed?.content ? <TemplateStageTree content={viewed.content} label={viewed.name} /> : <SkeletonLines lines={5} />}
        </Modal>
      )}
    </section>
  )
}
