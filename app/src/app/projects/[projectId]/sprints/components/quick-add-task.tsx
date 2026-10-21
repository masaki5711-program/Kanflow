"use client"

import { useId, useState } from "react"
import { useLanguage } from "@/lib/language-context"
import { Button, Input } from "@/components/ui"
import { CirclePlus, Plus } from "lucide-react"

interface Props {
  /** "#12" — names the PBI the input adds to. */
  pbRef: string
  /** Resolves true when the task was created. */
  onAdd: (taskName: string) => Promise<boolean>
  /** Opens the full form (owner, estimate, several tasks at once). */
  onOpenForm: () => void
}

/**
 * Always-visible add row at the end of a PBI's task list: type a name and press
 * Enter to add it (the field stays focused for the next one); the button opens
 * the full form.
 */
export default function QuickAddTask({ pbRef, onAdd, onOpenForm }: Props) {
  const { t } = useLanguage()
  const id = useId()
  const [value, setValue] = useState("")
  const [busy, setBusy] = useState(false)

  async function submit() {
    const name = value.trim()
    if (!name || busy) return
    setBusy(true)
    try {
      if (await onAdd(name)) setValue("")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 px-2 pt-2">
      <label htmlFor={id} className="sr-only">{t.sprintUxQuickAddLabel.replace("{pbi}", pbRef)}</label>
      <div className="relative min-w-0 flex-1 basis-56">
        <Plus className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" aria-hidden="true" />
        <Input id={id} inputSize="sm" value={value} disabled={busy} maxLength={200} className="pl-8"
          placeholder={t.sprintUxQuickAddPlaceholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            // IME confirmation must not add a half-typed name.
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void submit()
            }
          }} />
      </div>
      <Button size="sm" variant="ghost" leftIcon={<CirclePlus className="h-4 w-4" />} onClick={onOpenForm}>
        {t.sprintAddTaskShort}
      </Button>
    </div>
  )
}
