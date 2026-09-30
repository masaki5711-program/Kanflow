"use client"

import type { ReactNode } from "react"
import { ArrowRight, FolderOpen, Languages, Lightbulb, ListChecks, ListOrdered, Target } from "lucide-react"
import { useLanguage } from "@/lib/language-context"
import { pickText } from "@/lib/translation/pick-text"
import { cn } from "@/components/ui"
import type { SearchHitDto, SearchType } from "@/services/search/search.types"
import type { PaletteCommand } from "./palette-commands"

export type PaletteOption =
  | { key: string; kind: "command"; command: PaletteCommand }
  | { key: string; kind: "hit"; hit: SearchHitDto }

export interface PaletteSection {
  key: string
  label: string
  options: PaletteOption[]
}

const HIT_ICON: Record<SearchType, ReactNode> = {
  pbi: <ListOrdered aria-hidden className="h-4 w-4" />,
  task: <ListChecks aria-hidden className="h-4 w-4" />,
  icebox: <Lightbulb aria-hidden className="h-4 w-4" />,
  project: <FolderOpen aria-hidden className="h-4 w-4" />,
  goal: <Target aria-hidden className="h-4 w-4" />,
}

/** Short reference shown before a title: PBI-12 / #4. */
function hitRef(hit: SearchHitDto): string | null {
  if (hit.displayId === null) return null
  return hit.type === "pbi" ? `PBI-${hit.displayId}` : `#${hit.displayId}`
}

function firstLine(text: string): string {
  return text.split(/\r?\n/, 1)[0]?.trim() ?? ""
}

function HitContent({ hit }: { hit: SearchHitDto }) {
  const { t, language } = useLanguage()
  const title = firstLine(pickText(hit.i18n, hit.titleField, hit.title, language).text) || t.searchUntitled
  const projectName = pickText(hit.projectI18n, "name", hit.projectName, language).text
  const ref = hitRef(hit)
  const meta = hit.type === "project" ? null : [projectName, hit.context].filter(Boolean).join(" / ")
  return (
    <>
      <span className="mt-0.5 shrink-0 text-fg-subtle">{HIT_ICON[hit.type]}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body text-fg">
          {ref && <span className="mr-1.5 font-mono text-caption text-fg-muted">{ref}</span>}
          {title}
        </span>
        {meta && <span className="block truncate text-caption text-fg-muted">{meta}</span>}
      </span>
    </>
  )
}

function CommandContent({ command }: { command: PaletteCommand }) {
  const Icon = command.action.kind === "language" ? Languages : ArrowRight
  return (
    <>
      <span className="mt-0.5 shrink-0 text-fg-subtle">
        <Icon aria-hidden className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1 truncate text-body text-fg">{command.label}</span>
    </>
  )
}

interface ResultsListProps {
  listboxId: string
  label: string
  sections: PaletteSection[]
  activeKey: string | null
  optionId: (key: string) => string
  onHover: (key: string) => void
  onSelect: (option: PaletteOption) => void
}

/** The listbox of the palette: grouped options, pointer-selectable, active one highlighted. */
export function SearchResultsList({ listboxId, label, sections, activeKey, optionId, onHover, onSelect }: ResultsListProps) {
  return (
    <div id={listboxId} role="listbox" aria-label={label} className="px-2 pb-2">
      {sections.map((section) => {
        const headingId = `${listboxId}-${section.key}`
        return (
          <div key={section.key} role="group" aria-labelledby={headingId} className="pt-2">
            <div id={headingId} className="px-3 pb-1 text-caption font-semibold text-fg-subtle">
              {section.label}
            </div>
            {section.options.map((option) => {
              const active = option.key === activeKey
              return (
                <div
                  key={option.key}
                  id={optionId(option.key)}
                  role="option"
                  aria-selected={active}
                  // Pointer only: keyboard focus stays in the input (aria-activedescendant).
                  onMouseMove={() => !active && onHover(option.key)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onSelect(option)}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-ui-sm px-3 py-2",
                    active ? "bg-primary-soft [&_*]:text-primary-strong" : "hover:bg-surface-muted",
                  )}
                >
                  {option.kind === "hit" ? <HitContent hit={option.hit} /> : <CommandContent command={option.command} />}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
