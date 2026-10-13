"use client"

import { useState } from "react"
import { Button, Field, Modal, Textarea, useToast } from "@/components/ui"
import { apiFetch } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import type { TeamMessage } from "./types"

export type ConvertTarget = "pbi" | "icebox"

interface Props {
  projectId: string
  message: TeamMessage
  canPbi: boolean
  canIcebox: boolean
  onClose: () => void
}

const PBI_TITLE_MAX = 200
const ICEBOX_REQUEST_MAX = 5000

/** First line, trimmed to a title length. */
export function titleOf(text: string): string {
  const first = text.trim().split(/\r?\n/)[0] ?? ""
  return first.length > PBI_TITLE_MAX ? `${first.slice(0, PBI_TITLE_MAX - 1)}…` : first
}

/** Request bodies of the existing backlog / icebox create APIs, built from the edited text and a link back to the message. */
export function convertPayload(target: ConvertTarget, text: string, link: string, linkLabel: string, authorName: string | null) {
  const trimmed = text.trim()
  const ref = `${linkLabel}: ${link}`
  if (target === "pbi") {
    return { initiative: titleOf(trimmed), userStory: trimmed, referenceDoc: ref }
  }
  return { request: trimmed.slice(0, ICEBOX_REQUEST_MAX), background: ref, ...(authorName ? { author: authorName } : {}) }
}

/** 項目にする: turn a team-chat message into a backlog PBI or an Icebox request (existing create APIs). */
export function ConvertMessageDialog({ projectId, message, canPbi, canIcebox, onClose }: Props) {
  const { t } = useLanguage()
  const toast = useToast()
  const [target, setTarget] = useState<ConvertTarget>(canPbi ? "pbi" : "icebox")
  const [text, setText] = useState(message.body)
  const [busy, setBusy] = useState(false)
  const base = `/api/projects/${encodeURIComponent(projectId)}`

  async function submit() {
    setBusy(true)
    const link = `${window.location.origin}/projects/${encodeURIComponent(projectId)}/talk?message=${encodeURIComponent(message.id)}`
    const json = convertPayload(target, text, link, t.talkConvertLinkLabel, message.author?.name ?? null)
    try {
      await apiFetch(`${base}/${target === "pbi" ? "backlog" : "icebox"}`, { method: "POST", json })
      toast.success(target === "pbi" ? t.talkConvertDonePbi : t.talkConvertDoneIcebox)
      onClose()
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : t.talkConvertFailed, { title: t.talkConvertFailed })
      setBusy(false)
    }
  }

  const options: { value: ConvertTarget; label: string; enabled: boolean }[] = [
    { value: "pbi", label: t.talkConvertToPbi, enabled: canPbi },
    { value: "icebox", label: t.talkConvertToIcebox, enabled: canIcebox },
  ]

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={t.talkConvertTitle}
      description={t.talkConvertDesc}
      isDirty={text !== message.body && !busy}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t.cancel}</Button>
          <Button onClick={() => void submit()} disabled={!text.trim()} loading={busy} data-testid="talk-convert-submit">
            {t.talkConvertSubmit}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <fieldset>
          <legend className="mb-1 text-caption font-medium text-fg-muted">{t.talkConvertTarget}</legend>
          <div className="flex flex-wrap gap-4">
            {options.filter((o) => o.enabled).map((o) => (
              <label key={o.value} className="inline-flex min-h-8 items-center gap-2 text-body text-fg">
                <input type="radio" name="talk-convert-target" className="h-4 w-4" checked={target === o.value} onChange={() => setTarget(o.value)} />
                {o.label}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label={t.talkConvertText}>
          <Textarea value={text} rows={6} onChange={(e) => setText(e.target.value)} data-autofocus />
        </Field>
      </div>
    </Modal>
  )
}
