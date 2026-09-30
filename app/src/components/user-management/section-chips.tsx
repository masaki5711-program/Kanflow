"use client"

import type { SectionRef } from "./types"

interface Props {
  legend: string
  sections: SectionRef[]
  selected: string[]
  onChange: (ids: string[]) => void
}

/**
 * Multi-select chips backed by real (visually hidden) checkboxes, so they are
 * reachable with Tab and toggled with Space; the chip shows the focus ring.
 */
export function SectionChips({ legend, sections, selected, onChange }: Props) {
  return (
    <fieldset>
      <legend className="block text-body font-medium text-fg mb-1.5">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {sections.map((s) => {
          const checked = selected.includes(s.id)
          return (
            <label
              key={s.id}
              className={`inline-flex min-h-8 items-center gap-1.5 px-3 py-1 rounded-full text-caption font-medium cursor-pointer border has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus ${
                checked
                  ? "bg-primary-soft border-primary text-primary-active"
                  : "bg-surface border-border text-fg-muted hover:border-border-strong"
              }`}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={checked}
                onChange={(e) =>
                  onChange(e.target.checked ? [...selected, s.id] : selected.filter((id) => id !== s.id))
                }
              />
              {checked && <span aria-hidden>✓</span>}
              {s.name}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
