"use client"

import { useState, type ReactNode } from "react"
import { cn } from "@/components/ui"

export interface ToolbarItem {
  key: string
  label: string
  content: ReactNode
  onClick: () => void
  disabled?: boolean
  /** Toggle buttons (tools, colours, styles) say whether they are on. */
  pressed?: boolean
  /** A wider button with text (the zoom percentage, the text size). */
  wide?: boolean
}

export interface ToolbarGroup {
  key: string
  label?: string
  items: ToolbarItem[]
}

/** A colour dot for the swatch buttons (a crossed-out dot for "none"). */
export function Swatch({ color, none }: { color: string; none?: boolean }) {
  return (
    <span
      className={cn("block h-4 w-4 rounded-full border border-border-strong", none && "bg-surface")}
      style={
        none
          ? { backgroundImage: "linear-gradient(to top right, transparent 44%, var(--color-danger) 44%, var(--color-danger) 56%, transparent 56%)" }
          : { backgroundColor: color }
      }
    />
  )
}

interface ToolbarRowProps {
  label: string
  groups: ToolbarGroup[]
  testId?: string
}

/**
 * One toolbar (WAI-ARIA toolbar pattern): a single tab stop, ← / → / Home / End move between the buttons, so the
 * canvas stays a Tab or two away. Groups are separated by a rule and named for screen readers.
 */
export function ToolbarRow({ label, groups, testId }: ToolbarRowProps) {
  const [activeKey, setActiveKey] = useState<string | null>(null)

  // Exactly one button is in the tab order: the last one used while it can still be used, else the first.
  const enabled = groups.flatMap((group) => group.items).filter((item) => !item.disabled)
  const tabStop = enabled.some((item) => item.key === activeKey) ? activeKey : (enabled[0]?.key ?? null)

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key) || e.ctrlKey || e.metaKey || e.altKey) return
    const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"))
    if (buttons.length === 0) return
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const next =
      e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1 : (index + (e.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length
    e.preventDefault()
    buttons[next].focus()
  }

  return (
    <div
      role="toolbar"
      aria-label={label}
      aria-orientation="horizontal"
      data-testid={testId}
      className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1"
      onKeyDown={onKeyDown}
      onFocus={(e) => {
        const key = (e.target as HTMLElement).closest("button")?.dataset.toolbarKey
        if (key) setActiveKey(key)
      }}
    >
      {groups.map((group, index) => (
        <div key={group.key} role="group" aria-label={group.label} className={cn("flex flex-wrap items-center gap-0.5", index > 0 && "border-l border-border pl-1")}>
          {group.items.map((item) => (
            <button
              key={item.key}
              type="button"
              data-toolbar-key={item.key}
              aria-label={item.label}
              title={item.label}
              aria-pressed={item.pressed}
              disabled={item.disabled}
              tabIndex={item.key === tabStop ? 0 : -1}
              onClick={item.onClick}
              className={cn(
                "inline-flex h-8 shrink-0 items-center justify-center rounded-ui-sm text-caption font-medium text-fg-muted",
                "hover:bg-surface-sunken hover:text-fg",
                "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
                item.wide ? "min-w-12 px-1.5" : "w-8",
                item.pressed && "bg-primary-soft text-primary-strong ring-1 ring-inset ring-primary",
              )}
            >
              <span aria-hidden="true" className="inline-flex">
                {item.content}
              </span>
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
