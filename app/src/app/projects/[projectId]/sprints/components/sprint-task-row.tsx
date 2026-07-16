"use client"

import { useState } from "react"
import { useLanguage } from "@/lib/language-context"
import { IconClock, IconPencil, IconPerson, IconTrash, TaskStatusIcon } from "./sprint-icons"
import type { SprintItem } from "./types"

interface SprintTaskRowProps {
  sprintId: string
  task: SprintItem
  pointUnit: string
  /** Only one completion-comment editor is open per sprint card; the parent
   * tracks which task id owns it and passes the flag down. */
  isCommentEditorOpen: boolean
  onOpenCommentEditor: (taskId: string) => void
  onCloseCommentEditor: () => void
  /** Called when the status toggle is about to mark the task "done" —
   * the parent opens TaskCompleteDialog to capture a completion comment. */
  onRequestComplete: (task: SprintItem) => void
  onQuickUpdateTaskStatus: (sprintId: string, taskId: string, status: string, completionComment?: string | null) => void
  onStartEditTask: (sprintId: string, task: SprintItem) => void
  onDeleteTask: (sprintId: string, taskId: string) => void
  onEditCompletionComment: (sprintId: string, taskId: string, completionComment: string) => Promise<void> | void
  onSendToIcebox: (sprintId: string, taskId: string, request: string, background?: string) => Promise<void> | void
}

export default function SprintTaskRow({
  sprintId, task, pointUnit,
  isCommentEditorOpen, onOpenCommentEditor, onCloseCommentEditor,
  onRequestComplete, onQuickUpdateTaskStatus, onStartEditTask, onDeleteTask,
  onEditCompletionComment, onSendToIcebox,
}: SprintTaskRowProps) {
  const { t } = useLanguage()

  const taskStatusLabels: Record<string, string> = {
    todo: t.taskTodo, in_progress: t.taskInProgress, done: t.taskDone,
  }

  // Draft state lives in the row; it is (re)initialized in the edit-button
  // handler each time the editor opens, so stale drafts never leak between
  // open/close cycles or across rows.
  const [commentDraft, setCommentDraft] = useState("")
  const [commentSaving, setCommentSaving] = useState(false)
  // Optional Icebox follow-up: when on, the same Save action also creates a
  // new Icebox item so issues uncovered during the task aren't lost.
  const [iceboxEnabled, setIceboxEnabled] = useState(false)
  const [iceboxDraft, setIceboxDraft] = useState("")
  const [iceboxJustSent, setIceboxJustSent] = useState(false)

  function resetEditorState() {
    setCommentDraft("")
    setIceboxEnabled(false)
    setIceboxDraft("")
    setIceboxJustSent(false)
  }

  const assignees = (task.assignee ?? "")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean)

  return (
    <div className="rounded-lg hover:bg-gray-50 group transition-colors">
      <div className="flex items-center gap-2.5 py-2 px-2">
        <button
          onClick={() => {
            const next = task.status === "todo" ? "in_progress" : task.status === "in_progress" ? "done" : "todo"
            if (next === "done") {
              onRequestComplete(task)
            } else {
              onQuickUpdateTaskStatus(sprintId, task.id, next)
            }
          }}
          className={`flex-shrink-0 transition-colors ${
            task.status === "done" ? "text-emerald-500 hover:text-emerald-600"
            : task.status === "in_progress" ? "text-blue-500 hover:text-blue-600"
            : "text-gray-300 hover:text-gray-400"
          }`}
          title={t.sprintStatusClickToggle.replace("{status}", taskStatusLabels[task.status])}
        >
          <TaskStatusIcon status={task.status} className="w-5 h-5" />
        </button>

        <span className={`text-sm flex-1 truncate ${task.status === "done" ? "line-through text-gray-400" : "text-gray-700"}`}>
          {task.taskName || t.sprintNoTaskName}
        </span>

        {assignees.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1">
            {assignees.map((name) => (
              <span key={name} className="inline-flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">
                <IconPerson /> {name}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-xs text-gray-300">{t.sprintUnassigned}</span>
        )}

        {(task.estimatedHours || task.actualHours) && (
          <span
            className="inline-flex items-center gap-1 text-xs text-gray-500 whitespace-nowrap"
            title={`${t.sprintEstimatedHoursShort} / ${t.sprintActualHoursShort} (${pointUnit})`}
          >
            <IconClock />
            {t.sprintEstimatedHoursShort} {task.estimatedHours ?? "-"} · {t.sprintActualHoursShort} {task.actualHours ?? "-"} {pointUnit}
          </span>
        )}

        {/* Always visible (touch devices have no hover); hover just intensifies */}
        <div className="opacity-70 group-hover:opacity-100 flex gap-0.5 transition-opacity">
          <button onClick={() => onStartEditTask(sprintId, task)}
            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
            <IconPencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onDeleteTask(sprintId, task.id)}
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
            <IconTrash className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {task.status === "done" && (task.completionComment?.trim() || isCommentEditorOpen) && (
        <div className="ml-9 mr-2 mb-2 px-3 py-1.5 bg-emerald-50/60 border-l-2 border-emerald-300 rounded">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <p className="text-[10px] font-semibold text-emerald-700">{t.sprintTaskCompletionComment}</p>
            {!isCommentEditorOpen && (
              <button
                type="button"
                onClick={() => {
                  setCommentDraft(task.completionComment ?? "")
                  setIceboxEnabled(false)
                  setIceboxDraft("")
                  setIceboxJustSent(false)
                  onOpenCommentEditor(task.id)
                }}
                className="p-0.5 text-emerald-700/60 hover:text-emerald-800 hover:bg-emerald-100 rounded transition-colors"
                title={t.edit}
              >
                <IconPencil className="w-3 h-3" />
              </button>
            )}
          </div>
          {isCommentEditorOpen ? (
            <div className="space-y-1.5">
              <textarea
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value.slice(0, 5000))}
                rows={4}
                maxLength={5000}
                placeholder={t.sprintTaskCompletionCommentPlaceholder ?? ""}
                className="w-full px-2 py-1.5 text-xs border border-emerald-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 resize-y"
                autoFocus
              />
              <span className="text-[10px] text-emerald-700/60 block text-right">{commentDraft.length} / 5000</span>

              {/* Icebox follow-up panel */}
              <div className="border-t border-emerald-200/70 pt-1.5 mt-1">
                <label className="flex items-center gap-1.5 text-[11px] text-emerald-800 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={iceboxEnabled}
                    onChange={(e) => {
                      setIceboxEnabled(e.target.checked)
                      if (!e.target.checked) setIceboxDraft("")
                    }}
                    className="accent-cyan-600"
                  />
                  <span>🧊 {t.completionToIceboxToggle ?? "Iceboxにも追加(発見した問題・残課題など)"}</span>
                </label>
                {iceboxEnabled && (
                  <div className="mt-1.5">
                    <textarea
                      value={iceboxDraft}
                      onChange={(e) => setIceboxDraft(e.target.value.slice(0, 5000))}
                      rows={3}
                      maxLength={5000}
                      placeholder={t.completionToIceboxPlaceholder ?? "Iceboxへ送る内容を入力(空欄なら送信しません)"}
                      className="w-full px-2 py-1.5 text-xs border border-cyan-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/30 resize-y"
                    />
                    <span className="text-[10px] text-cyan-700/60 block text-right">{iceboxDraft.length} / 5000</span>
                  </div>
                )}
                {iceboxJustSent && (
                  <p className="text-[10px] text-cyan-700 mt-1">✓ {t.completionToIceboxSent ?? "Iceboxに追加しました"}</p>
                )}
              </div>

              <div className="flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  disabled={commentSaving}
                  onClick={() => {
                    resetEditorState()
                    onCloseCommentEditor()
                  }}
                  className="px-2 py-0.5 text-[11px] bg-white border border-gray-300 text-gray-600 rounded hover:bg-gray-50 disabled:opacity-50"
                >
                  {t.cancel}
                </button>
                <button
                  type="button"
                  disabled={commentSaving}
                  onClick={async () => {
                    try {
                      setCommentSaving(true)
                      const trimmedComment = commentDraft.trim()
                      const trimmedIcebox = iceboxDraft.trim()
                      // Save comment update + optional Icebox push in parallel-friendly order:
                      // comment first so the user sees the saved state instantly, then Icebox.
                      await onEditCompletionComment(sprintId, task.id, trimmedComment)
                      if (iceboxEnabled && trimmedIcebox) {
                        // Use the task name as default background to give the Icebox item context.
                        await onSendToIcebox(sprintId, task.id, trimmedIcebox, task.taskName ?? undefined)
                        setIceboxJustSent(true)
                        // Brief acknowledgement, then close the editor.
                        setTimeout(() => {
                          resetEditorState()
                          onCloseCommentEditor()
                        }, 900)
                      } else {
                        resetEditorState()
                        onCloseCommentEditor()
                      }
                    } finally {
                      setCommentSaving(false)
                    }
                  }}
                  className="px-2 py-0.5 text-[11px] bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
                >
                  {commentSaving ? t.saving : t.save}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-emerald-900 whitespace-pre-wrap leading-relaxed">{task.completionComment}</p>
          )}
        </div>
      )}
    </div>
  )
}
