"use client"

import { useRef, useState } from "react"

interface Props {
  value: string
  onCommit: (v: string) => void
  label: string
  placeholder?: string
  allowEmpty?: boolean
}

/** Inline cell editor: Enter or blur saves, Escape reverts. */
export function GlossaryInlineEdit({ value, onCommit, label, placeholder, allowEmpty = false }: Props) {
  const [draft, setDraft] = useState(value)
  const [lastValue, setLastValue] = useState(value)
  // Escape blurs synchronously while `draft` still holds the edit; skip that commit.
  const cancelledRef = useRef(false)
  // Re-sync the draft when the committed value changes (derived during render).
  if (value !== lastValue) {
    setLastValue(value)
    setDraft(value)
  }
  function finish() {
    if (cancelledRef.current) {
      cancelledRef.current = false
      return
    }
    const v = draft.trim()
    if (!allowEmpty && !v) {
      setDraft(value)
      return
    }
    if (v !== value) onCommit(v)
  }
  return (
    <input
      value={draft}
      aria-label={label}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={finish}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault()
          e.currentTarget.blur()
        } else if (e.key === "Escape") {
          cancelledRef.current = true
          setDraft(value)
          e.currentTarget.blur()
        }
      }}
      className="w-full min-w-[8rem] rounded-ui-sm border border-transparent bg-transparent px-1 py-1 text-body text-fg hover:border-border-strong focus:border-primary focus:bg-surface"
    />
  )
}
