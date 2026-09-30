"use client"

import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react"
import { Plus, X } from "lucide-react"
import { useLanguage } from "@/lib/language-context"
import { Badge, Button, Field, Select, cn, useToast } from "@/components/ui"
import { apiFetch, isAbortError } from "@/hooks"

export interface UserSearchResult {
  id: string
  name: string
  email: string
  employeeNumber: string | null
  department: string | null
  isMember: boolean
}

type MemberRole = "po" | "sm" | "dev"

interface Props {
  projectId: string
  onAdded: () => void
  rolePT: { rolePO: string; roleSM: string; roleDev: string }
}

const SEARCH_DEBOUNCE_MS = 200
const MIN_QUERY_LENGTH = 2

/** Search state for one query: results are tagged with the query they belong to. */
interface SearchState {
  query: string
  results: UserSearchResult[]
}

function useUserSearch(query: string, projectId: string, onError: (message: string) => void) {
  const [state, setState] = useState<SearchState>({ query: "", results: [] })
  const onErrorRef = useRef(onError)
  useEffect(() => {
    onErrorRef.current = onError
  })

  useEffect(() => {
    if (query.length < MIN_QUERY_LENGTH) return
    const ac = new AbortController()
    const handle = setTimeout(() => {
      const url = `/api/users/search?q=${encodeURIComponent(query)}&excludeProjectId=${encodeURIComponent(projectId)}`
      apiFetch<UserSearchResult[]>(url, { signal: ac.signal })
        .then((results) => setState({ query, results }))
        .catch((err: unknown) => {
          if (isAbortError(err)) return
          setState({ query, results: [] })
          onErrorRef.current(err instanceof Error ? err.message : String(err))
        })
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      clearTimeout(handle)
      ac.abort()
    }
  }, [query, projectId])

  const isCurrent = state.query === query
  return {
    results: isCurrent ? state.results : [],
    searching: query.length >= MIN_QUERY_LENGTH && !isCurrent,
  }
}

export function MemberPicker({ projectId, onAdded, rolePT }: Props) {
  const { t } = useLanguage()
  const toast = useToast()
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<UserSearchResult[]>([])
  const [role, setRole] = useState<MemberRole>("dev")
  const [adding, setAdding] = useState(false)
  const [focused, setFocused] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const listId = useId()
  const statusId = useId()

  const q = query.trim()
  const { results, searching } = useUserSearch(q, projectId, (message) =>
    toast.error(message, { title: t.memberPickerSearchFailed }),
  )

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setFocused(false)
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  function pickUser(u: UserSearchResult) {
    if (u.isMember) return
    setSelected((prev) => (prev.some((x) => x.id === u.id) ? prev : [...prev, u]))
    // Clear the search so the next person can be looked up straight away.
    setQuery("")
    setFocused(false)
    inputRef.current?.focus()
  }

  function removeFromSelected(id: string) {
    setSelected((prev) => prev.filter((x) => x.id !== id))
  }

  async function handleAdd() {
    if (selected.length === 0) return
    setAdding(true)
    try {
      await apiFetch(`/api/projects/${projectId}/members`, {
        method: "POST",
        json: { userIds: selected.map((u) => u.id), role },
      })
      setSelected([])
      setQuery("")
      onAdded()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err), { title: t.memberPickerAddFailed })
    } finally {
      setAdding(false)
    }
  }

  function focusResult(index: number) {
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])")
    if (!buttons || buttons.length === 0) return
    buttons[(index + buttons.length) % buttons.length]?.focus()
  }

  function onInputKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      if (!focused) setFocused(true)
      else focusResult(0)
    } else if (e.key === "Escape") {
      setFocused(false)
    }
  }

  function onListKeyDown(e: ReactKeyboardEvent<HTMLUListElement>) {
    const buttons = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? [])
    const index = buttons.findIndex((b) => b === document.activeElement)
    if (e.key === "ArrowDown") {
      e.preventDefault()
      focusResult(index + 1)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      if (index <= 0) inputRef.current?.focus()
      else focusResult(index - 1)
    } else if (e.key === "Escape") {
      // Focus first: the input's onFocus re-opens the dropdown, so close after it.
      inputRef.current?.focus()
      setFocused(false)
    }
  }

  const selectedIds = new Set(selected.map((u) => u.id))
  const showDropdown = focused && q.length >= 1
  const statusText =
    q.length < MIN_QUERY_LENGTH
      ? t.memberPickerEmpty
      : searching
        ? t.loading
        : results.length === 0
          ? t.userNoResults
          : t.memberPickerResults.replace("{count}", String(results.length))

  return (
    <div ref={containerRef} className="relative">
      <div className="flex flex-wrap items-center gap-2 rounded-ui-md border border-border-strong bg-surface px-2 py-2 focus-within:border-primary">
        {selected.map((u) => (
          <span
            key={u.id}
            className="inline-flex items-center gap-1.5 rounded-ui-sm border border-primary/30 bg-primary-soft px-2.5 py-1 text-body text-primary-active"
          >
            <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center rounded-full bg-surface text-caption font-bold">
              {u.name.slice(0, 1)}
            </span>
            <span className="font-medium">{u.name}</span>
            {u.department && <span className="text-caption">· {u.department}</span>}
            <button
              type="button"
              onClick={() => removeFromSelected(u.id)}
              className="-mr-1 inline-flex h-6 w-6 items-center justify-center rounded-full hover:bg-surface"
              aria-label={t.memberPickerRemove.replace("{name}", u.name)}
              title={t.memberPickerRemove.replace("{name}", u.name)}
            >
              <X aria-hidden className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label={t.memberPickerSearchLabel}
          aria-expanded={showDropdown}
          aria-controls={showDropdown ? listId : undefined}
          aria-autocomplete="list"
          aria-describedby={statusId}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            // Typing after Escape closed the popup re-opens the results.
            setFocused(true)
          }}
          onFocus={() => setFocused(true)}
          onKeyDown={onInputKeyDown}
          placeholder={t.memberPickerSearchPlaceholder}
          className="min-w-[12rem] flex-1 bg-transparent px-2 py-1 text-body outline-none placeholder:text-fg-subtle"
        />
      </div>

      <p id={statusId} role="status" aria-live="polite" className="sr-only">
        {focused && q.length >= 1 ? statusText : ""}
      </p>

      {showDropdown && (
        <div className="absolute left-0 right-0 z-20 mt-1 max-h-80 overflow-y-auto rounded-ui-md border border-border bg-surface shadow-ui-lg">
          {results.length === 0 || searching || q.length < MIN_QUERY_LENGTH ? (
            <p className="px-4 py-3 text-body text-fg-muted">{statusText}</p>
          ) : (
            <ul id={listId} ref={listRef} onKeyDown={onListKeyDown} className="divide-y divide-border">
              {results.map((u) => (
                <MemberResult key={u.id} user={u} isSelected={selectedIds.has(u.id)} onPick={pickUser} />
              ))}
            </ul>
          )}
        </div>
      )}

      {selected.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-ui-md bg-surface-muted px-4 py-3">
          <span className="text-body text-fg-muted">
            <strong className="text-fg">{selected.length}</strong> {t.memberPickerSelected}
          </span>
          <Field label={t.memberPickerRole} hideLabel className="w-auto">
            <Select selectSize="sm" value={role} onChange={(e) => setRole(e.target.value as MemberRole)}>
              <option value="dev">{rolePT.roleDev}</option>
              <option value="sm">{rolePT.roleSM}</option>
              <option value="po">{rolePT.rolePO}</option>
            </Select>
          </Field>
          <Button
            size="sm"
            className="ml-auto"
            loading={adding}
            onClick={handleAdd}
            leftIcon={<Plus aria-hidden className="h-4 w-4" />}
          >
            {t.memberPickerAddSelected}
          </Button>
        </div>
      )}
    </div>
  )
}

function MemberResult({
  user: u,
  isSelected,
  onPick,
}: {
  user: UserSearchResult
  isSelected: boolean
  onPick: (u: UserSearchResult) => void
}) {
  const { t } = useLanguage()
  const disabled = u.isMember || isSelected
  return (
    <li>
      <button
        type="button"
        onClick={() => onPick(u)}
        disabled={disabled}
        className={cn(
          "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors",
          disabled ? "cursor-not-allowed bg-surface-muted opacity-70" : "hover:bg-primary-soft focus:bg-primary-soft",
        )}
      >
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-body font-semibold text-fg-muted"
        >
          {u.name.slice(0, 2)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate text-body font-semibold text-fg">{u.name}</span>
            {u.employeeNumber && <span className="font-mono text-caption text-fg-muted">{u.employeeNumber}</span>}
            {u.isMember && <Badge tone="success" size="sm">{t.memberPickerAlreadyAdded}</Badge>}
            {!u.isMember && isSelected && <Badge tone="primary" size="sm">✓ {t.memberPickerSelected}</Badge>}
          </span>
          <span className="flex items-center gap-2 truncate text-caption text-fg-muted">
            <span>{u.email}</span>
            {u.department && <span>· {u.department}</span>}
          </span>
        </span>
      </button>
    </li>
  )
}
