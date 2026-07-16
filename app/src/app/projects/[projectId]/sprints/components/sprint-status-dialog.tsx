"use client"

import { useState } from "react"
import { useLanguage } from "@/lib/language-context"
import { AIResultModal } from "@/components/ai-result-modal"

interface Sprint {
  id: string
  sprintName: string
  status: string
  reviewComment: string | null
  retrospectiveMemo: string | null
  retrospectiveKeep?: string | null
  retrospectiveProblem?: string | null
  retrospectiveTry?: string | null
}

interface StatusDialogState {
  sprintId: string
  sprintName: string
  nextStatus: string
  reviewComment: string
  retrospectiveMemo: string
  retrospectiveKeep: string
  retrospectiveProblem: string
  retrospectiveTry: string
}

interface SprintStatusDialogProps {
  sprint: Sprint | undefined
  dialog: StatusDialogState
  onDialogChange: (dialog: StatusDialogState) => void
  onSubmit: () => void
  onCancel: () => void
  projectId: string
}

export default function SprintStatusDialog({
  sprint,
  dialog,
  onDialogChange,
  onSubmit,
  onCancel,
  projectId,
}: SprintStatusDialogProps) {
  const { t, language } = useLanguage()
  const [showRetroAI, setShowRetroAI] = useState(false)

  const statusLabels: Record<string, string> = {
    planning: t.sprintStatusPlanning,
    active: t.sprintStatusActive,
    review: t.sprintStatusReview,
    done: t.sprintStatusDone,
    archived: t.sprintStatusArchived,
  }

  const isEditOnly = sprint?.status === dialog.nextStatus
  // KPT + other memo are shown whenever transitioning into review or done.
  const showRetroFields = dialog.nextStatus === "review" || dialog.nextStatus === "done"
  const hasLegacyReview = !!(sprint?.reviewComment && sprint.reviewComment.trim().length > 0)

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 shrink-0">
          <h3 className="text-xl font-bold text-gray-900">
            {isEditOnly ? t.sprintRetrospectiveMemo : t.sprintReviewDialogTitle}
          </h3>
          {!isEditOnly ? (
            <p className="text-sm text-gray-500 mt-1">
              <span className="font-medium text-gray-700">{dialog.sprintName}</span>
              <span className="mx-2 text-gray-300">→</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-xs font-medium">
                {statusLabels[dialog.nextStatus] ?? dialog.nextStatus}
              </span>
            </p>
          ) : (
            <p className="text-sm text-gray-500 mt-1 font-medium">{dialog.sprintName}</p>
          )}
        </div>

        {/* Body (scrollable) */}
        <div className="px-6 py-5 overflow-y-auto flex-1 space-y-6">
          {/* Legacy review comment — read-only banner when pre-existing data */}
          {hasLegacyReview && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <p className="text-xs font-semibold text-amber-700 mb-1">
                {t.sprintReviewComment}（legacy · read-only）
              </p>
              <p className="text-sm text-amber-900 whitespace-pre-wrap">{sprint?.reviewComment}</p>
            </div>
          )}

          {/* KPT grid */}
          {showRetroFields && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="flex items-center gap-2 text-base font-semibold text-gray-800">
                  <span className="inline-block w-1.5 h-5 bg-blue-500 rounded-sm" />
                  {t.sprintRetrospectiveMemo} — KPT
                </label>
                <button
                  type="button"
                  onClick={() => setShowRetroAI(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-purple-700 border border-purple-300 rounded-lg hover:bg-purple-50 px-3 py-1.5 transition-colors"
                >
                  <span aria-hidden>🤖</span>
                  {t.aiRetroSynthesis}
                </button>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Keep */}
                <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-4">
                  <label className="flex items-center gap-2 text-sm font-bold text-emerald-700 mb-2">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500 text-white text-xs">K</span>
                    {t.sprintKptKeep}
                  </label>
                  <textarea
                    value={dialog.retrospectiveKeep}
                    onChange={(e) => onDialogChange({ ...dialog, retrospectiveKeep: e.target.value })}
                    placeholder={t.sprintKptKeepPlaceholder}
                    rows={8}
                    className="w-full px-3 py-2.5 border border-emerald-200 bg-white rounded-lg text-base leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 resize-y placeholder:text-gray-300"
                  />
                </div>

                {/* Problem */}
                <div className="bg-rose-50/60 border border-rose-200 rounded-xl p-4">
                  <label className="flex items-center gap-2 text-sm font-bold text-rose-700 mb-2">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-rose-500 text-white text-xs">P</span>
                    {t.sprintKptProblem}
                  </label>
                  <textarea
                    value={dialog.retrospectiveProblem}
                    onChange={(e) => onDialogChange({ ...dialog, retrospectiveProblem: e.target.value })}
                    placeholder={t.sprintKptProblemPlaceholder}
                    rows={8}
                    className="w-full px-3 py-2.5 border border-rose-200 bg-white rounded-lg text-base leading-relaxed focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500 resize-y placeholder:text-gray-300"
                  />
                </div>

                {/* Try */}
                <div className="bg-sky-50/60 border border-sky-200 rounded-xl p-4">
                  <label className="flex items-center gap-2 text-sm font-bold text-sky-700 mb-2">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-sky-500 text-white text-xs">T</span>
                    {t.sprintKptTry}
                  </label>
                  <textarea
                    value={dialog.retrospectiveTry}
                    onChange={(e) => onDialogChange({ ...dialog, retrospectiveTry: e.target.value })}
                    placeholder={t.sprintKptTryPlaceholder}
                    rows={8}
                    className="w-full px-3 py-2.5 border border-sky-200 bg-white rounded-lg text-base leading-relaxed focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 resize-y placeholder:text-gray-300"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Other memo */}
          {showRetroFields && (
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-600 mb-2">
                <span className="inline-block w-1 h-4 bg-gray-300 rounded-sm" />
                {t.sprintRetrospectiveOther}
              </label>
              <textarea
                value={dialog.retrospectiveMemo}
                onChange={(e) => onDialogChange({ ...dialog, retrospectiveMemo: e.target.value })}
                placeholder={t.sprintRetrospectiveOtherPlaceholder}
                rows={4}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 resize-y placeholder:text-gray-300"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 shrink-0 bg-gray-50/60 rounded-b-2xl">
          <button
            onClick={onCancel}
            className="px-5 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
          >
            {t.cancel}
          </button>
          <button
            onClick={onSubmit}
            className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            {isEditOnly ? t.save : t.sprintSubmitAndChangeStatus}
          </button>
        </div>
      </div>
      {showRetroAI && sprint && (
        <AIResultModal
          title={t.aiRetroTitle}
          fetchUrl={`/api/projects/${projectId}/sprints/${sprint.id}/ai/retro-synthesis`}
          fetchBody={{ lang: language }}
          onClose={() => setShowRetroAI(false)}
          footer={(text, done) =>
            done && text.trim() ? (
              <button
                type="button"
                onClick={() => {
                  const append = dialog.retrospectiveTry
                    ? `${dialog.retrospectiveTry}\n\n--- AI 提案 ---\n${text}`
                    : text
                  onDialogChange({ ...dialog, retrospectiveTry: append })
                  setShowRetroAI(false)
                }}
                className="px-4 py-2 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                {t.aiAddToTry}
              </button>
            ) : null
          }
        />
      )}
    </div>
  )
}
