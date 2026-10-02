"use client"

import { I18nText, useI18nText } from "@/components/i18n-text"
import { useLanguage } from "@/lib/language-context"
import type { EntityI18n } from "@/lib/translation/types"
import type { BacklogItemDetailDto } from "@/types/api"
import { PbiAttachmentList } from "./attachments/pbi-attachment-list"
import { toAttachmentItems } from "./attachments/use-saved-pbi-attachments"
import { PbiPlanLink } from "./pbi-plan-field"

export type PbiDetail = Omit<BacklogItemDetailDto, "iceboxItemId" | "productGoalId"> &
  Partial<Pick<BacklogItemDetailDto, "iceboxItemId" | "productGoalId">> & {
    /** Linked master-plan item (null = none / in the trash). */
    planItem?: { id: string; name: string } | null
    planItemId?: string | null
  }

/** Read-only view of every PBI field (viewer-locale text with translation badges). */
export function PbiReadBody({ item, projectId }: { item: PbiDetail; projectId?: string }) {
  const { t, pt } = useLanguage()
  const headIcebox = useI18nText(item.iceboxItem?.i18n, "request", item.iceboxItem?.request)
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ReadField label={pt.backlogInitiative} value={item.initiative} i18n={item.i18n} field="initiative" entityId={item.id} />
        <ReadField label={pt.backlogEpic} value={item.epic} i18n={item.i18n} field="epic" entityId={item.id} />
      </div>
      <ReadField label={pt.backlogUserStory} value={item.userStory} multiline i18n={item.i18n} field="userStory" entityId={item.id} />
      <ReadField label={pt.backlogAcceptanceCriteria} value={item.acceptanceCriteria} multiline i18n={item.i18n} field="acceptanceCriteria" entityId={item.id} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <ReadField label={pt.backlogWorkloadScore} value={item.workloadScore != null ? String(item.workloadScore) : null} />
        <ReadField label={pt.rolePO} value={item.assignedPo} />
        {item.iceboxItem && <ReadField label={pt.iceboxTitle} value={`#${item.iceboxItem.displayId} ${headIcebox.text}`} />}
        {projectId && <PbiPlanLink projectId={projectId} planItem={item.planItem} />}
      </div>
      <ReadField label={t.backlogPoNote} value={item.poNote} multiline i18n={item.i18n} field="poNote" entityId={item.id} />
      {item.status === "not_ready" && item.notReadyReason && (
        <ReadField label={t.backlogNotReadyReason} value={item.notReadyReason} multiline i18n={item.i18n} field="notReadyReason" entityId={item.id} />
      )}
      <div>
        <ReadField label={t.backlogReferenceDoc} value={item.referenceDoc} multiline />
        {projectId && item.attachments && item.attachments.length > 0 && (
          <div className="mt-2">
            <PbiAttachmentList items={toAttachmentItems(projectId, item.id, item.attachments)} />
          </div>
        )}
      </div>
    </div>
  )
}

interface ReadFieldProps {
  label: string
  value: string | null
  multiline?: boolean
  /** When given, the viewer-locale side is shown (with a pending badge until translated). */
  i18n?: EntityI18n
  field?: string
  entityId?: string
}

function ReadField({ label, value, multiline, i18n, field, entityId }: ReadFieldProps) {
  const hasValue = !!(value && value.trim())
  const cls = `text-body text-fg ${multiline ? "whitespace-pre-wrap leading-relaxed" : ""} bg-surface-muted rounded-ui-md px-3 py-2 min-h-[38px] break-words`
  return (
    <div>
      <p className="mb-1 text-caption font-medium text-fg-muted">{label}</p>
      <div>
        {!hasValue ? (
          <p className="min-h-[38px] rounded-ui-md bg-surface-muted px-3 py-2 text-body text-fg-subtle">—</p>
        ) : field ? (
          <I18nText
            as="p"
            i18n={i18n}
            field={field}
            original={value}
            entity={entityId ? { type: "backlog_item", id: entityId } : undefined}
            className={cls}
          />
        ) : (
          <p className={cls}>{value}</p>
        )}
      </div>
    </div>
  )
}
