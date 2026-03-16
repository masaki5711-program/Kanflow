"use client"

import { useLanguage } from "@/lib/language-context"

interface Sprint {
  id: string
  sprintName: string
  status: string
  reviewComment: string | null
  retrospectiveMemo: string | null
}

interface StatusDialogState {
  sprintId: string
  sprintName: string
  nextStatus: string
  reviewComment: string
  retrospectiveMemo: string
}

interface SprintStatusDialogProps {
  sprint: Sprint | undefined
  dialog: StatusDialogState
  onDialogChange: (dialog: StatusDialogState) => void
  onSubmit: () => void
  onCancel: () => void
}

export default function SprintStatusDialog({
  sprint,
  dialog,
  onDialogChange,
  onSubmit,
  onCancel,
}: SprintStatusDialogProps) {
  const { t } = useLanguage()

  const statusLabels: Record<string, string> = {
    planning: t.sprintStatusPlanning,
    active: t.sprintStatusActive,
    review: t.sprintStatusReview,
    done: t.sprintStatusDone,
    archived: t.sprintStatusArchived,
  }

  const isEditOnly = sprint?.status === dialog.nextStatus
  const showReviewField = dialog.nextStatus === "review" || dialog.nextStatus === "done"
  const showRetroField = dialog.nextStatus === "done"

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onCancel}>
      <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-1">
          {isEditOnly ? `${t.sprintReviewComment} / ${t.sprintRetrospectiveMemo}` : t.sprintReviewDialogTitle}
        </h3>
        {!isEditOnly && (
          <p className="text-sm text-gray-500 mb-4">
            {dialog.sprintName}: &rarr; {statusLabels[dialog.nextStatus] ?? dialog.nextStatus}
          </p>
        )}
        {isEditOnly && (
          <p className="text-sm text-gray-500 mb-4">{dialog.sprintName}</p>
        )}

        {/* Review comment */}
        {showReviewField && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">{t.sprintReviewComment}</label>
            <textarea
              value={dialog.reviewComment}
              onChange={(e) => onDialogChange({ ...dialog, reviewComment: e.target.value })}
              placeholder={t.sprintReviewCommentPlaceholder}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
        )}

        {/* Retrospective memo */}
        {showRetroField && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">{t.sprintRetrospectiveMemo}</label>
            <textarea
              value={dialog.retrospectiveMemo}
              onChange={(e) => onDialogChange({ ...dialog, retrospectiveMemo: e.target.value })}
              placeholder={t.sprintRetrospectiveMemoPlaceholder}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            {t.cancel}
          </button>
          <button
            onClick={onSubmit}
            className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700"
          >
            {isEditOnly ? t.save : t.sprintSubmitAndChangeStatus}
          </button>
        </div>
      </div>
    </div>
  )
}
