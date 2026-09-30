"use client"

import { useEffect, useRef, type KeyboardEvent } from "react"
import { Check } from "lucide-react"
import { cn } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { CARD_COLORS, colorDot, colorLabel, type Category } from "./types"

export const MENU_WIDTH = 220

export interface MenuAnchor {
  x: number
  y: number
  projectId: string
}

interface Props {
  anchor: MenuAnchor
  categories: Category[]
  currentColor: string | null
  onToggleCategory: (categoryId: string) => void
  onSetColor: (color: string | null) => void
  /** `restoreFocus` is true for keyboard dismissals (Escape) so focus returns to the trigger. */
  onClose: (restoreFocus: boolean) => void
}

const ITEM_SELECTOR = '[role="menuitemcheckbox"],[role="menuitemradio"],[role="menuitem"]'

function focusItem(menu: HTMLElement, index: number) {
  const items = Array.from(menu.querySelectorAll<HTMLElement>(ITEM_SELECTOR))
  if (items.length === 0) return
  const wrapped = (index + items.length) % items.length
  items[wrapped].focus()
}

/**
 * Per-project options (category assignment, card colour). WAI-ARIA menu:
 * focus moves into the menu on open, arrow keys / Home / End move between
 * items, Escape closes and returns focus, Tab closes. Clicks inside keep it
 * open so several toggles can be made in a row.
 */
export function ProjectOptionsMenu({ anchor, categories, currentColor, onToggleCategory, onSetColor, onClose }: Props) {
  const { t } = useLanguage()
  const menuRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (menuRef.current) focusItem(menuRef.current, 0)
  }, [anchor.projectId])

  useEffect(() => {
    // Target-based outside-click check: the click that opened the menu also
    // reaches `document`, so ignore clicks on any options trigger.
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null
      if (target?.closest("[data-ctx-menu]") || target?.closest("[data-ctx-trigger]")) return
      onCloseRef.current(false)
    }
    document.addEventListener("click", handleClick)
    return () => document.removeEventListener("click", handleClick)
  }, [])

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const menu = menuRef.current
    if (!menu) return
    const items = Array.from(menu.querySelectorAll<HTMLElement>(ITEM_SELECTOR))
    const index = items.indexOf(document.activeElement as HTMLElement)
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        focusItem(menu, index + 1)
        break
      case "ArrowUp":
        e.preventDefault()
        focusItem(menu, index - 1)
        break
      case "Home":
        e.preventDefault()
        focusItem(menu, 0)
        break
      case "End":
        e.preventDefault()
        focusItem(menu, items.length - 1)
        break
      case "Escape":
        e.preventDefault()
        e.stopPropagation()
        onClose(true)
        break
      case "Tab":
        onClose(false)
        break
    }
  }

  const top = typeof window === "undefined" ? anchor.y : Math.min(anchor.y, Math.max(8, window.innerHeight - 360))

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={t.projectOptions}
      data-ctx-menu
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className="fixed z-50 rounded-xl border border-border bg-surface py-2 shadow-ui-overlay"
      style={{ left: anchor.x, top, width: MENU_WIDTH }}
    >
      {categories.length > 0 && (
        <div role="group" aria-labelledby="project-menu-categories">
          <div id="project-menu-categories" className="px-3 py-1.5 text-caption font-semibold uppercase tracking-wider text-fg-muted">
            {t.categoryCategory}
          </div>
          {categories.map((cat) => {
            const assigned = cat.assignments.some((a) => a.projectId === anchor.projectId)
            return (
              <button
                key={cat.id}
                type="button"
                role="menuitemcheckbox"
                aria-checked={assigned}
                tabIndex={-1}
                onClick={() => onToggleCategory(cat.id)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-body text-fg hover:bg-surface-muted focus-visible:bg-surface-muted"
              >
                <span aria-hidden="true" className={cn("h-3 w-3 rounded-full", colorDot[cat.color] ?? colorDot.gray)} />
                <span className="flex-1 text-left">{cat.name}</span>
                {assigned && <Check aria-hidden="true" className="h-4 w-4 text-primary" />}
              </button>
            )
          })}
          <div role="separator" className="my-1.5 border-t border-border" />
        </div>
      )}

      <div role="group" aria-labelledby="project-menu-colors">
        <div id="project-menu-colors" className="px-3 py-1.5 text-caption font-semibold uppercase tracking-wider text-fg-muted">
          {t.projectCardColor}
        </div>
        <div className="flex flex-wrap gap-1.5 px-3 py-1.5">
          {CARD_COLORS.map((c) => {
            const label = colorLabel(t, c)
            return (
              <button
                key={c}
                type="button"
                role="menuitemradio"
                aria-checked={currentColor === c}
                aria-label={label}
                title={label}
                tabIndex={-1}
                onClick={() => onSetColor(c)}
                className={cn(
                  "h-6 w-6 rounded-full transition-transform hover:scale-110",
                  colorDot[c],
                  currentColor === c ? "ring-2 ring-primary ring-offset-2" : "ring-1 ring-inset ring-black/10",
                )}
              />
            )
          })}
        </div>
        <button
          type="button"
          role="menuitemradio"
          aria-checked={currentColor === null}
          tabIndex={-1}
          onClick={() => onSetColor(null)}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-body text-fg hover:bg-surface-muted focus-visible:bg-surface-muted"
        >
          <span aria-hidden="true" className="h-3 w-3 rounded-full bg-surface ring-1 ring-inset ring-border-strong" />
          <span className="flex-1 text-left">{t.projectCardColorDefault}</span>
          {currentColor === null && <Check aria-hidden="true" className="h-4 w-4 text-primary" />}
        </button>
      </div>
    </div>
  )
}
