"use client"

import { useLanguage } from "@/lib/language-context"
import { I18nText } from "@/components/i18n-text"
import type { Sprint } from "./types"

type KptField = "retrospectiveKeep" | "retrospectiveProblem" | "retrospectiveTry"

const KPT_STYLE: Record<KptField, { letter: string; box: string; title: string; dot: string; text: string }> = {
  retrospectiveKeep: { letter: "K", box: "bg-success-soft border-success/30", title: "text-success-strong", dot: "bg-success", text: "text-fg" },
  retrospectiveProblem: { letter: "P", box: "bg-danger-soft border-danger/30", title: "text-danger-strong", dot: "bg-danger", text: "text-fg" },
  retrospectiveTry: { letter: "T", box: "bg-info-soft border-info/30", title: "text-info", dot: "bg-info", text: "text-fg" },
}

/** Read-only review / KPT / memo blocks under the sprint header. */
export default function SprintRetroSummary({ sprint }: { sprint: Sprint }) {
  const { t } = useLanguage()
  const entity = { type: "sprint", id: sprint.id } as const
  const kptTitles: Record<KptField, string> = {
    retrospectiveKeep: t.sprintKptKeep, retrospectiveProblem: t.sprintKptProblem, retrospectiveTry: t.sprintKptTry,
  }
  const kptFields = (Object.keys(KPT_STYLE) as KptField[]).filter((f) => sprint[f])
  if (!sprint.reviewComment && kptFields.length === 0 && !sprint.retrospectiveMemo) return null

  return (
    <div className="px-6 pb-3 space-y-2">
      {sprint.reviewComment && (
        <div className="bg-warning-soft border border-warning/30 rounded-ui-sm px-3 py-2">
          <span className="text-caption font-semibold text-warning">
            {t.sprintReviewComment}
            <span className="font-normal ml-1">({t.sprintReviewLegacyLabel})</span>
          </span>
          <I18nText as="p" i18n={sprint.i18n} field="reviewComment" original={sprint.reviewComment} entity={entity}
            className="text-body text-fg whitespace-pre-wrap mt-0.5" />
        </div>
      )}
      {kptFields.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {kptFields.map((field) => {
            const style = KPT_STYLE[field]
            return (
              <div key={field} className={`border rounded-ui-sm px-3 py-2 ${style.box}`}>
                <span className={`inline-flex items-center gap-1 text-caption font-semibold ${style.title}`}>
                  <span aria-hidden="true" className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-caption ${style.dot}`}>
                    {style.letter}
                  </span>
                  {kptTitles[field]}
                </span>
                <I18nText as="p" i18n={sprint.i18n} field={field} original={sprint[field]} entity={entity}
                  className={`text-body whitespace-pre-wrap mt-1 ${style.text}`} />
              </div>
            )
          })}
        </div>
      )}
      {sprint.retrospectiveMemo && (
        <div className="bg-surface-muted border border-border rounded-ui-sm px-3 py-2">
          <span className="text-caption font-semibold text-fg-muted">{t.sprintRetrospectiveOther}</span>
          <I18nText as="p" i18n={sprint.i18n} field="retrospectiveMemo" original={sprint.retrospectiveMemo} entity={entity}
            className="text-body text-fg whitespace-pre-wrap mt-0.5" />
        </div>
      )}
    </div>
  )
}
