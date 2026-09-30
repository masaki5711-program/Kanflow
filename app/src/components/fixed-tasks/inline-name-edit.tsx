"use client"

import { useState } from "react"
import { useLanguage } from "@/lib/language-context"
import { Button, Input } from "@/components/ui"

interface Props {
  initial: string
  label: string
  onSave: (name: string) => Promise<void>
  onCancel: () => void
}

/** Text input + Update / Cancel. Enter saves, Escape cancels. */
export function InlineNameEdit({ initial, label, onSave, onCancel }: Props) {
  const { t } = useLanguage()
  const [value, setValue] = useState(initial)
  const [saving, setSaving] = useState(false)

  async function save() {
    const trimmed = value.trim()
    if (!trimmed || trimmed === initial) {
      onCancel()
      return
    }
    setSaving(true)
    try {
      await onSave(trimmed)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-1 flex-wrap items-center gap-2">
      <Input
        inputSize="sm"
        value={value}
        aria-label={label}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            void save()
          } else if (e.key === "Escape") {
            // Keep Escape from also closing the surrounding dialog.
            e.stopPropagation()
            onCancel()
          }
        }}
        data-autofocus
        autoFocus
        className="min-w-[10rem] flex-1"
      />
      <Button size="sm" loading={saving} onClick={() => void save()}>
        {t.update}
      </Button>
      <Button size="sm" variant="secondary" onClick={onCancel}>
        {t.cancel}
      </Button>
    </div>
  )
}
