"use client"

import { useId, useState } from "react"
import { useParams } from "next/navigation"
import { ReactionBar } from "@/components/reactions/reaction-bar"
import { useLanguage } from "@/lib/language-context"
import { GlossaryHint, I18nText } from "@/components/i18n-text"
import { Button, Field, IconButton, Textarea } from "@/components/ui"
import type { SprintItem, SprintTaskActions } from "./types"
import { Pencil } from "lucide-react"

const MAX_LEN = 5000

interface Props {
  sprintId: string
  task: SprintItem
  isOpen: boolean
  onOpen: () => void
  onClose: () => void
  onSave: SprintTaskActions["onEditCompletionComment"]
  onSendToIcebox: SprintTaskActions["onSendToIcebox"]
}

/**
 * Completion comment of a done task: read-only text with an edit button, or
 * the editor. The editor can also push a follow-up item to the Icebox so
 * issues uncovered during the task are not lost.
 */
export default function CompletionCommentEditor({ sprintId, task, isOpen, onOpen, onClose, onSave, onSendToIcebox }: Props) {
  const { t } = useLanguage()
  const projectId = useParams<{ projectId?: string }>()?.projectId
  const iceboxToggleId = useId()
  const [commentDraft, setCommentDraft] = useState("")
  const [iceboxEnabled, setIceboxEnabled] = useState(false)
  const [iceboxDraft, setIceboxDraft] = useState("")
  const [saving, setSaving] = useState(false)

  function open() {
    setCommentDraft(task.completionComment ?? "")
    setIceboxEnabled(false)
    setIceboxDraft("")
    onOpen()
  }

  async function save() {
    setSaving(true)
    try {
      const saved = await onSave(sprintId, task.id, commentDraft.trim())
      if (!saved) return
      const iceboxText = iceboxDraft.trim()
      if (iceboxEnabled && iceboxText) {
        const sent = await onSendToIcebox(iceboxText, task.taskName ?? undefined)
        if (!sent) return
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="group ml-10 mr-2 mb-2 px-3 py-1.5 bg-success-soft/60 border-l-2 border-success rounded-ui-sm">
      <div className="flex items-center justify-between gap-2 mb-0.5">
        <p className="text-caption font-semibold text-success">{t.sprintTaskCompletionComment}</p>
        {!isOpen && (
          <IconButton size="sm" label={t.sprintTaskEditComment} icon={<Pencil className="w-3.5 h-3.5" />} onClick={open} />
        )}
      </div>
      {isOpen ? (
        <div className="space-y-1.5">
          <Field label={t.sprintTaskCompletionComment} hideLabel hint={`${commentDraft.length} / ${MAX_LEN}`}>
            <Textarea value={commentDraft} rows={4} maxLength={MAX_LEN} autoFocus
              placeholder={t.sprintTaskCompletionCommentPlaceholder}
              onChange={(e) => setCommentDraft(e.target.value.slice(0, MAX_LEN))} />
          </Field>
          <GlossaryHint />

          <div className="border-t border-success/30 pt-1.5 mt-1 space-y-1.5">
            <label htmlFor={iceboxToggleId} className="flex items-center gap-2 min-h-8 text-caption text-fg cursor-pointer select-none">
              <input id={iceboxToggleId} type="checkbox" checked={iceboxEnabled} className="h-4 w-4 accent-info"
                onChange={(e) => {
                  setIceboxEnabled(e.target.checked)
                  if (!e.target.checked) setIceboxDraft("")
                }} />
              <span><span aria-hidden="true">🧊 </span>{t.completionToIceboxToggle}</span>
            </label>
            {iceboxEnabled && (
              <Field label={t.completionToIceboxToggle} hideLabel hint={`${iceboxDraft.length} / ${MAX_LEN}`}>
                <Textarea value={iceboxDraft} rows={3} maxLength={MAX_LEN} placeholder={t.completionToIceboxPlaceholder}
                  onChange={(e) => setIceboxDraft(e.target.value.slice(0, MAX_LEN))} />
              </Field>
            )}
          </div>

          <div className="flex items-center justify-end gap-1.5">
            <Button size="sm" variant="secondary" disabled={saving} onClick={onClose}>{t.cancel}</Button>
            <Button size="sm" loading={saving} onClick={save}>{t.save}</Button>
          </div>
        </div>
      ) : (
        <>
          <I18nText as="p" i18n={task.i18n} field="completionComment" original={task.completionComment}
            entity={{ type: "sprint_task", id: task.id }} className="text-body text-fg whitespace-pre-wrap leading-relaxed" />
          {projectId && task.completionComment?.trim() && (
            <ReactionBar projectId={projectId} targetType="task_completion" targetId={task.id} />
          )}
        </>
      )}
    </div>
  )
}
