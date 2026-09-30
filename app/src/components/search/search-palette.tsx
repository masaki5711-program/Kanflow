"use client"

import { useEffect, useId, useMemo, useState, type KeyboardEvent } from "react"
import { useRouter } from "next/navigation"
import { Search } from "lucide-react"
import { useLanguage } from "@/lib/language-context"
import { fillTemplate } from "@/lib/fill-template"
import { Modal, Spinner } from "@/components/ui"
import type { SearchResultDto, SearchType } from "@/services/search/search.types"
import type { Translations } from "@/lib/i18n"
import { buildPaletteCommands, filterCommands } from "./palette-commands"
import { SearchResultsList, type PaletteOption, type PaletteSection } from "./search-results-list"
import { useSearchResults, type SearchState } from "./use-search-results"

export interface SearchPaletteProps {
  open: boolean
  onClose: () => void
  /** Current project (from the URL) for the "go to" commands. */
  projectId: string | null
}

const GROUP_LABEL: Record<SearchType, keyof Translations> = {
  pbi: "searchGroupPbi",
  task: "searchGroupTask",
  icebox: "searchGroupIcebox",
  project: "searchGroupProject",
  goal: "searchGroupGoal",
}

function hitSections(result: SearchResultDto | null, t: Translations): PaletteSection[] {
  return (result?.groups ?? []).map((g) => ({
    key: g.type,
    label: t[GROUP_LABEL[g.type]] as string,
    options: g.items.map((hit): PaletteOption => ({ key: `hit:${hit.type}:${hit.id}`, kind: "hit", hit })),
  }))
}

function statusText(state: SearchState, query: string, count: number, t: Translations): string {
  switch (state.status) {
    case "short":
      return t.searchMinChars
    case "loading":
      return t.searchSearching
    case "error":
      return t.searchFailed
    case "done":
      return count === 0 ? fillTemplate(t.searchNoResults, { query: query.trim() }) : fillTemplate(t.searchResultCount, { count })
    default:
      return ""
  }
}

/**
 * Global search / command palette (Ctrl+K, ⌘K, `/`): WAI-ARIA combobox with
 * a grouped listbox. ↑/↓ move the active option (wrapping), Enter opens it,
 * Esc closes (kit Modal). Commands are filtered locally; results come from
 * /api/search (debounced, stale requests aborted).
 */
export function SearchPalette({ open, onClose, projectId }: SearchPaletteProps) {
  const { t } = useLanguage()
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t.searchDialogTitle}
      size="lg"
      closeOnOverlayClick
      bodyClassName="p-0"
      footer={<p className="mr-auto text-caption text-fg-muted">{t.searchKeyboardHint}</p>}
    >
      <PaletteBody onClose={onClose} projectId={projectId} />
    </Modal>
  )
}

function PaletteBody({ onClose, projectId }: Omit<SearchPaletteProps, "open">) {
  const { t, pt, language, setLanguage } = useLanguage()
  const router = useRouter()
  const [input, setInput] = useState("")
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const search = useSearchResults(input)
  const uid = useId().replace(/:/g, "")
  const listboxId = `${uid}-listbox`

  const commands = useMemo(
    () => filterCommands(buildPaletteCommands({ projectId, t, pt, language }), input),
    [projectId, t, pt, language, input],
  )
  const sections = useMemo(() => {
    const commandSection: PaletteSection[] = commands.length
      ? [{ key: "commands", label: t.searchGroupCommands, options: commands.map((c) => ({ key: c.id, kind: "command" as const, command: c })) }]
      : []
    // Results first once the user searched; commands first on an empty box.
    const hits = hitSections(search.result, t)
    return input.trim() ? [...hits, ...commandSection] : [...commandSection, ...hits]
  }, [commands, search.result, input, t])
  const options = useMemo(() => sections.flatMap((s) => s.options), [sections])
  const idByKey = useMemo(() => new Map(options.map((o, i) => [o.key, `${uid}-opt-${i}`])), [options, uid])
  const active = options.find((o) => o.key === activeKey) ?? options[0] ?? null
  const hitCount = search.result?.groups.reduce((n, g) => n + g.items.length, 0) ?? 0

  useEffect(() => {
    if (!active) return
    document.getElementById(idByKey.get(active.key) ?? "")?.scrollIntoView?.({ block: "nearest" })
  }, [active, idByKey])

  function select(option: PaletteOption) {
    if (option.kind === "command" && option.command.action.kind === "language") {
      setLanguage(option.command.action.language)
      onClose()
      return
    }
    const href = option.kind === "hit" ? option.hit.href : option.command.action.kind === "navigate" ? option.command.action.href : "/"
    onClose()
    router.push(href)
  }

  function move(delta: number) {
    if (options.length === 0) return
    const index = active ? options.indexOf(active) : -1
    setActiveKey(options[(index + delta + options.length) % options.length].key)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing) return
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault()
      move(e.key === "ArrowDown" ? 1 : -1)
    } else if (e.key === "Enter" && active) {
      e.preventDefault()
      select(active)
    }
  }

  return (
    <div>
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-surface px-4 py-2">
        <Search aria-hidden className="h-5 w-5 shrink-0 text-fg-subtle" />
        <input
          data-autofocus
          type="text"
          role="combobox"
          aria-label={t.searchInputLabel}
          aria-expanded={options.length > 0}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={active ? idByKey.get(active.key) : undefined}
          placeholder={t.searchPlaceholder}
          value={input}
          onChange={(e) => {
            setInput(e.target.value)
            setActiveKey(null)
          }}
          onKeyDown={onKeyDown}
          autoComplete="off"
          spellCheck={false}
          className="min-h-10 w-full bg-transparent text-body-lg text-fg placeholder:text-fg-subtle"
        />
        {search.status === "loading" && <Spinner size="sm" />}
      </div>
      <p role="status" className="px-5 pt-2 text-caption text-fg-muted empty:hidden">
        {statusText(search, input, hitCount, t)}
      </p>
      <SearchResultsList
        listboxId={listboxId}
        label={t.searchDialogTitle}
        sections={sections}
        activeKey={active?.key ?? null}
        optionId={(key) => idByKey.get(key) ?? key}
        onHover={setActiveKey}
        onSelect={select}
      />
    </div>
  )
}
