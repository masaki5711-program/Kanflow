"use client"

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react"
import { Send } from "lucide-react"
import { useLanguage } from "@/lib/language-context"
import { activeMentionQuery, MENTION_ALL_NAMES, mentionTokenName, toComposerText, toStoredMentions } from "@/lib/mentions"
import { Button, Field, Textarea } from "@/components/ui"
import { MentionListbox } from "./mention-listbox"
import { COMMENT_BODY_MAX, MENTION_ALL_ID, type MentionMember } from "./types"

/** Suggestions shown at once. */
const MAX_SUGGESTIONS = 8

interface Props {
  members: readonly MentionMember[]
  /** The member list is still loading: Enter on an @token waits for it instead of typing a newline. */
  membersLoading?: boolean
  /** Resolve true when saved (the composer then clears unless `initialValue` is set). */
  onSubmit: (body: string) => Promise<boolean>
  /** Accessible label of the text area (visually hidden). */
  label: string
  submitLabel: string
  initialValue?: string
  onCancel?: () => void
  autoFocus?: boolean
  /** Submit is allowed with empty text (e.g. the team chat sends files only). */
  allowEmpty?: boolean
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

/** True when the @-query is empty or the start of the "everyone" name / one of its keywords. */
export function matchesMentionAll(query: string, displayName: string): boolean {
  const q = fold(query)
  return q === "" || [displayName, ...MENTION_ALL_NAMES].some((n) => fold(n).startsWith(q))
}

/** True when the @-query is a mention already picked, followed by more text (the list stays closed). */
export function isCompletedMention(query: string, names: readonly string[]): boolean {
  return names.some((n) => query.length > n.length && query.startsWith(n) && !/[\p{L}\p{N}_]/u.test(query[n.length]))
}

/**
 * Comment text area with @mention autocomplete. Typing `@` lists project
 * members (filtered as you type); ↑/↓ move, Enter or Tab inserts `@Name`
 * (shown as typed; stored as the `@[Name]` token on save, A3-20),
 * Escape closes the list (without closing a surrounding modal).
 * Ctrl/⌘ + Enter submits. While an @token is open, Enter never types a
 * newline: it inserts the active match; while the members are still loading
 * (the list shows a loading row) the first match is inserted once they
 * arrive; with no match it does nothing (Escape closes the list, then Enter
 * types a newline).
 */
export function CommentComposer({ members, membersLoading = false, onSubmit, label, submitLabel, initialValue = "", onCancel, autoFocus, allowEmpty = false }: Props) {
  const { t } = useLanguage()
  // Display text shows mentions as "@Name"; `names` turns them back into tokens on save.
  const [initial] = useState(() => toComposerText(initialValue))
  const [value, setValue] = useState(initial.text)
  const [names, setNames] = useState<readonly string[]>(initial.names)
  const [caret, setCaret] = useState(initial.text.length)
  const [activeIndex, setActiveIndex] = useState(0)
  // Start index of a query the user dismissed with Escape (stays closed until a new @).
  const [dismissedAt, setDismissedAt] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // Start index of the @token whose Enter came before the members loaded.
  const [pendingPickAt, setPendingPickAt] = useState<number | null>(null)
  const ref = useRef<HTMLTextAreaElement>(null)
  const pendingCaret = useRef<number | null>(null)
  const listId = useId()

  const query = activeMentionQuery(value, caret)
  const mention = query && !isCompletedMention(query.query, names) ? query : null
  const isOpen = !!mention && mention.start !== dismissedAt
  // "@全員" heads the list while the query still fits it (or any "everyone" keyword) and there is someone to notify.
  const allEntry: MentionMember = { id: MENTION_ALL_ID, name: t.commentsMentionAllName, hint: t.commentsMentionAllHint }
  const suggestions = isOpen
    ? [...(members.length > 0 && matchesMentionAll(mention.query, allEntry.name) ? [allEntry] : []), ...filterMembers(members, mention.query)]
    : []
  const active = suggestions.length > 0 ? Math.min(activeIndex, suggestions.length - 1) : -1
  const tooLong = value.length > COMMENT_BODY_MAX
  const canSubmit = (value.trim().length > 0 || allowEmpty) && !tooLong && !submitting && (allowEmpty || value !== initial.text)

  // The members arrived after an early Enter: insert the first match (or give up when none matches).
  const firstMatch = pendingPickAt !== null && mention?.start === pendingPickAt && !membersLoading ? (suggestions[0] ?? null) : undefined
  useEffect(() => {
    if (firstMatch === undefined) return
    setPendingPickAt(null)
    if (firstMatch) insert(firstMatch)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per resolved pending pick
  }, [firstMatch])

  useLayoutEffect(() => {
    if (pendingCaret.current === null || !ref.current) return
    ref.current.setSelectionRange(pendingCaret.current, pendingCaret.current)
    pendingCaret.current = null
  }, [value])

  function update(next: string, nextCaret: number) {
    setValue(next)
    setCaret(nextCaret)
    setActiveIndex(0)
    // Escape dismisses one @token only: once it is gone, a new @ at the same place opens the list again (F-08).
    if (!activeMentionQuery(next, nextCaret)) setDismissedAt(null)
  }

  function insert(member: MentionMember) {
    if (!mention) return
    const name = mentionTokenName(member.name)
    const token = `@${name} `
    setNames((prev) => (prev.includes(name) ? prev : [...prev, name]))
    const next = value.slice(0, mention.start) + token + value.slice(caret)
    const at = mention.start + token.length
    pendingCaret.current = at
    update(next, at)
  }

  async function submit() {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const ok = await onSubmit(toStoredMentions(value.trim(), names))
      if (ok && !initialValue) {
        update("", 0)
        setNames([])
      }
    } finally {
      setSubmitting(false)
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // An @token typed before the members loaded: keep the composer as it is and pick once they arrive.
    if (e.key === "Enter" && isOpen && membersLoading && mention) {
      e.preventDefault()
      e.stopPropagation()
      setPendingPickAt(mention.start)
      return
    }
    // While an @token is open, plain Enter never types a newline (it picks, or does nothing without a match).
    if (e.key === "Enter" && isOpen && !e.ctrlKey && !e.metaKey && !e.shiftKey && suggestions.length === 0) {
      e.preventDefault()
      e.stopPropagation()
      return
    }
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
          <MentionListbox id={listId} anchorRef={ref} suggestions={suggestions} active={active} optionId={optionId}
            loading={membersLoading} onPick={insert} />
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
