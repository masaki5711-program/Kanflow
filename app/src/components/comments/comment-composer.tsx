"use client"

import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react"
import { Send } from "lucide-react"
import { useLanguage } from "@/lib/language-context"
import { activeMentionQuery, mentionToken } from "@/lib/mentions"
import { Button, Field, Textarea, cn } from "@/components/ui"
import { COMMENT_BODY_MAX, type MentionMember } from "./types"

/** Suggestions shown at once. */
const MAX_SUGGESTIONS = 8

interface Props {
  members: readonly MentionMember[]
  /** Resolve true when saved (the composer then clears unless `initialValue` is set). */
  onSubmit: (body: string) => Promise<boolean>
  /** Accessible label of the text area (visually hidden). */
  label: string
  submitLabel: string
  initialValue?: string
  onCancel?: () => void
  autoFocus?: boolean
}

function fold(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, "")
}

/** Members whose name contains the query (prefix matches first). */
export function filterMembers(members: readonly MentionMember[], query: string): MentionMember[] {
  const q = fold(query)
  const hits = members.filter((m) => fold(m.name).includes(q))
  const starts = hits.filter((m) => fold(m.name).startsWith(q))
  return [...starts, ...hits.filter((m) => !starts.includes(m))].slice(0, MAX_SUGGESTIONS)
}

/**
 * Comment text area with @mention autocomplete. Typing `@` lists project
 * members (filtered as you type); ↑/↓ move, Enter or Tab inserts `@[Name]`,
 * Escape closes the list (without closing a surrounding modal).
 * Ctrl/⌘ + Enter submits.
 */
export function CommentComposer({ members, onSubmit, label, submitLabel, initialValue = "", onCancel, autoFocus }: Props) {
  const { t } = useLanguage()
  const [value, setValue] = useState(initialValue)
  const [caret, setCaret] = useState(initialValue.length)
  const [activeIndex, setActiveIndex] = useState(0)
  // Start index of a query the user dismissed with Escape (stays closed until a new @).
  const [dismissedAt, setDismissedAt] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)
  const pendingCaret = useRef<number | null>(null)
  const listId = useId()

  const mention = activeMentionQuery(value, caret)
  const isOpen = !!mention && mention.start !== dismissedAt
  const suggestions = isOpen ? filterMembers(members, mention.query) : []
  const active = suggestions.length > 0 ? Math.min(activeIndex, suggestions.length - 1) : -1
  const tooLong = value.length > COMMENT_BODY_MAX
  const canSubmit = value.trim().length > 0 && !tooLong && !submitting && value !== initialValue

  useLayoutEffect(() => {
    if (pendingCaret.current === null || !ref.current) return
    ref.current.setSelectionRange(pendingCaret.current, pendingCaret.current)
    pendingCaret.current = null
  }, [value])

  function update(next: string, nextCaret: number) {
    setValue(next)
    setCaret(nextCaret)
    setActiveIndex(0)
  }

  function insert(member: MentionMember) {
    if (!mention) return
    const token = `${mentionToken(member.name)} `
    const next = value.slice(0, mention.start) + token + value.slice(caret)
    const at = mention.start + token.length
    pendingCaret.current = at
    update(next, at)
  }

  async function submit() {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const ok = await onSubmit(value.trim())
      if (ok && !initialValue) update("", 0)
    } finally {
      setSubmitting(false)
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      void submit()
      return
    }
    if (!isOpen) return
    const handled = handleListKey(e.key)
    if (handled) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  /** List navigation; returns true when the key was consumed. */
  function handleListKey(key: string): boolean {
    if (key === "Escape") {
      setDismissedAt(mention?.start ?? null)
      return true
    }
    if (suggestions.length === 0) return false
    if (key === "ArrowDown") setActiveIndex((active + 1) % suggestions.length)
    else if (key === "ArrowUp") setActiveIndex((active - 1 + suggestions.length) % suggestions.length)
    else if (key === "Enter" || key === "Tab") insert(suggestions[active])
    else return false
    return true
  }

  const optionId = (i: number) => `${listId}-opt-${i}`

  return (
    <div className="space-y-2">
      <div className="relative">
        <Field label={label} hideLabel error={tooLong ? t.commentsTooLong.replace("{max}", String(COMMENT_BODY_MAX)) : undefined}
          hint={t.commentsSendHint}>
          <Textarea
            ref={ref}
            value={value}
            rows={3}
            autoFocus={autoFocus}
            placeholder={t.commentsPlaceholder}
            className="resize-y"
            aria-autocomplete="list"
            aria-controls={isOpen ? listId : undefined}
            aria-activedescendant={active >= 0 ? optionId(active) : undefined}
            onChange={(e) => update(e.target.value, e.target.selectionStart ?? e.target.value.length)}
            onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
            onKeyDown={onKeyDown}
          />
        </Field>
        {isOpen && (
          <ul id={listId} role="listbox" aria-label={t.commentsMentionListLabel}
            className="absolute left-0 right-0 z-20 mt-1 max-h-60 overflow-auto rounded-ui-md border border-border bg-surface py-1 shadow-ui-lg">
            {suggestions.length === 0 ? (
              <li role="presentation" className="px-3 py-2 text-caption text-fg-muted">{t.commentsMentionNoMatch}</li>
            ) : (
              suggestions.map((m, i) => (
                <li key={m.id} id={optionId(i)} role="option" aria-selected={i === active}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insert(m)}
                  className={cn("cursor-pointer px-3 py-1.5 text-body", i === active ? "bg-primary-soft text-primary-strong" : "text-fg hover:bg-surface-muted")}>
                  @{m.name}
                </li>
              ))
            )}
          </ul>
        )}
      </div>
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={submitting}>
            {t.commentsCancel}
          </Button>
        )}
        <Button size="sm" onClick={() => void submit()} loading={submitting} disabled={!canSubmit}
          leftIcon={initialValue ? undefined : <Send className="h-4 w-4" />}>
          {submitLabel}
        </Button>
      </div>
    </div>
  )
}
