"use client"

import { useState } from "react"
import { Button, Field, Input, Modal } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { LINK_NAME_MAX, LINK_URL_MAX, normalizeLinkUrl, suggestLinkName } from "@/lib/attachment-links"
import type { LinkFormState } from "./use-attachments"

interface Props {
  form: LinkFormState
  /** Folder name the link is added to (null = unfiled). */
  folderName: string | null
  onSave: (name: string, url: string) => Promise<boolean>
  onClose: () => void
}

/**
 * Add / edit a link entry. Paste a GitLab URL and the repository name
 * ("group/repo") is filled in until the user types their own name.
 */
export function LinkFormModal({ form, folderName, onSave, onClose }: Props) {
  const { t } = useLanguage()
  const editing = form.mode === "edit"
  const [url, setUrl] = useState(editing ? (form.file.linkUrl ?? "") : "")
  const [name, setName] = useState(editing ? form.file.originalName : "")
  // The name follows the URL until the user edits it themselves.
  const [nameTouched, setNameTouched] = useState(editing)
  const [touchedUrl, setTouchedUrl] = useState(false)
  const [saving, setSaving] = useState(false)
  const valid = normalizeLinkUrl(url) !== null
  const urlError = touchedUrl && url.trim() && !valid ? t.attLinkUrlInvalid : undefined

  function changeUrl(value: string) {
    setUrl(value)
    if (!nameTouched) setName(suggestLinkName(value))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setTouchedUrl(true)
    if (!valid || saving) return
    setSaving(true)
    const ok = await onSave(name.trim(), url.trim())
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={editing ? t.attLinkEditTitle : t.attLinkFormTitle}
      description={!editing && folderName ? t.folderCreateIn.replace("{name}", folderName) : undefined}
      isDirty={!saving && (editing ? url !== (form.file.linkUrl ?? "") || name !== form.file.originalName : !!url.trim())}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t.cancel}</Button>
          <Button type="submit" form="attachment-link-form" loading={saving} disabled={!valid}>{t.attLinkSave}</Button>
        </>
      }
    >
      <form id="attachment-link-form" onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
        <Field label={t.attLinkUrl} error={urlError} required>
          <Input
            type="url"
            inputMode="url"
            value={url}
            maxLength={LINK_URL_MAX}
            placeholder={t.attLinkUrlPlaceholder}
            onChange={(e) => changeUrl(e.target.value)}
            onBlur={() => setTouchedUrl(true)}
            data-autofocus
          />
        </Field>
        <Field label={t.attLinkName} hint={t.attLinkNameHint}>
          <Input
            value={name}
            maxLength={LINK_NAME_MAX}
            placeholder={t.attLinkNamePlaceholder}
            onChange={(e) => {
              setNameTouched(true)
              setName(e.target.value)
            }}
          />
        </Field>
      </form>
    </Modal>
  )
}
