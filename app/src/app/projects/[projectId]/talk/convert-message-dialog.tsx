"use client"

import { useState } from "react"
import { Button, Field, Modal, Select, Textarea, useToast } from "@/components/ui"
import { apiFetch, useApiQuery } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import type { TeamMessage } from "./types"

export type ConvertTarget = "pbi" | "icebox" | "task"

interface Props {
  projectId: string
  message: TeamMessage
  canPbi: boolean
  canIcebox: boolean
  canTask: boolean
  onClose: () => void
}

const PBI_TITLE_MAX = 200
const ICEBOX_REQUEST_MAX = 5000

/** First line, trimmed to a title length. */
export function titleOf(text: string): string {
  const first = text.trim().split(/\r?\n/)[0] ?? ""
  return first.length > PBI_TITLE_MAX ? `${first.slice(0, PBI_TITLE_MAX - 1)}…` : first
}

/** A sprint of GET /sprints reduced to what the task picker needs. */
interface SprintChoice {
  id: string
  sprintName: string
  status: string
  items: { pbItem: { id: string; displayId: number; initiative?: string | null; userStory?: string | null } }[]
}

/** Sprints that still take tasks, the running one first. */
export function openSprints(sprints: readonly SprintChoice[]): SprintChoice[] {
  const rank = (s: SprintChoice) => (s.status === "active" ? 0 : 1)
  return sprints.filter((s) => s.status === "active" || s.status === "planning").sort((a, b) => rank(a) - rank(b))
}

/** The PBIs of a sprint, once each. */
export function sprintPbis(sprint: SprintChoice | undefined): SprintChoice["items"][number]["pbItem"][] {
  const seen = new Map<string, SprintChoice["items"][number]["pbItem"]>()
  for (const item of sprint?.items ?? []) seen.set(item.pbItem.id, item.pbItem)
  return [...seen.values()].sort((a, b) => a.displayId - b.displayId)
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

/** The task name is the first line of the text (tasks have no body). */
export function taskPayload(text: string, pbItemId: string) {
  return { pbItemId, taskName: titleOf(text).slice(0, 500) }
}

/** 項目にする: turn a team-chat message into a backlog PBI or an Icebox request (existing create APIs). */
export function ConvertMessageDialog({ projectId, message, canPbi, canIcebox, canTask, onClose }: Props) {
  const { t } = useLanguage()
  const toast = useToast()
  const [target, setTarget] = useState<ConvertTarget>(canPbi ? "pbi" : canIcebox ? "icebox" : "task")
  const [text, setText] = useState(message.body)
  const [busy, setBusy] = useState(false)
  const base = `/api/projects/${encodeURIComponent(projectId)}`
  const [sprintId, setSprintId] = useState("")
  const [pbiId, setPbiId] = useState("")
  const sprintsQuery = useApiQuery<SprintChoice[]>(target === "task" ? `${base}/sprints` : null)
  const sprints = openSprints(sprintsQuery.data ?? [])
  const sprint = sprints.find((s) => s.id === sprintId) ?? sprints[0]
  const pbis = sprintPbis(sprint)
  const pbi = pbis.find((p) => p.id === pbiId) ?? pbis[0]
  const taskReady = target !== "task" || !!(sprint && pbi)

  async function submit() {
    setBusy(true)
    const link = `${window.location.origin}/projects/${encodeURIComponent(projectId)}/talk?message=${encodeURIComponent(message.id)}`
    const done = { pbi: t.talkConvertDonePbi, icebox: t.talkConvertDoneIcebox, task: t.talkConvertDoneTask }[target]
    try {
      if (target === "task") {
        if (!sprint || !pbi) return
        await apiFetch(`${base}/sprints/${encodeURIComponent(sprint.id)}/tasks`, { method: "POST", json: taskPayload(text, pbi.id) })
      } else {
        const json = convertPayload(target, text, link, t.talkConvertLinkLabel, message.author?.name ?? null)
        await apiFetch(`${base}/${target === "pbi" ? "backlog" : "icebox"}`, { method: "POST", json })
      }
      toast.success(done)
      onClose()
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : t.talkConvertFailed, { title: t.talkConvertFailed })
      setBusy(false)
    }
  }

  const options: { value: ConvertTarget; label: string; enabled: boolean }[] = [
    { value: "pbi", label: t.talkConvertToPbi, enabled: canPbi },
    { value: "icebox", label: t.talkConvertToIcebox, enabled: canIcebox },
    { value: "task", label: t.talkConvertToTask, enabled: canTask },
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
          <Button onClick={() => void submit()} disabled={!text.trim() || !taskReady} loading={busy} data-testid="talk-convert-submit">
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
        {target === "task" && (
          sprints.length === 0 ? (
            !sprintsQuery.isLoading && <p className="text-caption text-fg-muted">{t.talkConvertNoSprint}</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={t.talkConvertSprint}>
                <Select value={sprint?.id ?? ""} onChange={(e) => { setSprintId(e.target.value); setPbiId("") }}>
                  {sprints.map((s) => <option key={s.id} value={s.id}>{s.sprintName}</option>)}
                </Select>
              </Field>
              <Field label={t.talkConvertPbi}>
                <Select value={pbi?.id ?? ""} onChange={(e) => setPbiId(e.target.value)}>
                  {pbis.map((p) => <option key={p.id} value={p.id}>{`#${p.displayId} ${titleOf(p.initiative || p.userStory || "")}`}</option>)}
                </Select>
              </Field>
            </div>
          )
        )}
        <Field label={t.talkConvertText}>
          <Textarea value={text} rows={6} onChange={(e) => setText(e.target.value)} data-autofocus />
        </Field>
      </div>
    </Modal>
  )
}
