"use client"

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { Check, ChevronRight } from "lucide-react"
import { cn } from "@/components/ui"

/** One entry of a menu. */
export type MenuEntry =
  | { kind: "item"; key: string; label: string; icon?: ReactNode; shortcut?: string; onSelect: () => void; disabled?: boolean; checked?: boolean }
  | { kind: "submenu"; key: string; label: string; icon?: ReactNode; items: MenuEntry[]; disabled?: boolean }
  | { kind: "heading"; key: string; label: string }
  | { kind: "separator"; key: string }

interface BoardMenuProps {
  /** Accessible name of the menu. */
  label: string
  items: MenuEntry[]
  /** Where it opens (viewport coordinates): the pointer, or below a button. */
  at: { x: number; y: number }
  onClose: () => void
  /** The focus goes back here when the menu closes (the canvas or the button that opened it). */
  returnFocus?: () => HTMLElement | null | undefined
  /** The button that opened it: a press on it is left to the button (which closes the menu), not taken as "outside". */
  opener?: () => HTMLElement | null | undefined
  /** A submenu: closes back to its parent with ←, and opens to the left of `flipX` when it does not fit on the right. */
  nested?: boolean
  flipX?: number
  /** A submenu: choosing an entry closes the whole menu. */
  closeAll?: () => void
  id?: string
}

type Focusable = Extract<MenuEntry, { kind: "item" | "submenu" }>

/** Keys the menu handles itself: they never reach the toolbar or the canvas around it. */
const MENU_KEYS = new Set(["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End", "Escape", "Tab", "Enter", " "])

/**
 * A menu (WAI-ARIA menu pattern): ↑ / ↓ / Home / End move (disabled entries are reached too, so they can be read),
 * Enter or Space chooses, → opens a submenu and ← closes it, Esc or a press elsewhere closes it and the focus goes
 * back where it was. Rendered at the page's root, inside the window.
 */
export function BoardMenu({ label, items, at, onClose, returnFocus, opener, nested, flipX, closeAll, id }: BoardMenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [openSub, setOpenSub] = useState<{ key: string; at: { x: number; y: number }; flipX: number } | null>(null)
  /** Hovering another entry closes an open submenu after a moment (a diagonal move towards it does not). */
  const closeSubTimer = useRef<number | null>(null)
  useEffect(() => () => {
    if (closeSubTimer.current !== null) window.clearTimeout(closeSubTimer.current)
  }, [])
  const ownId = useId()
  const menuId = id ?? ownId
  const closeRef = useRef(onClose)
  const openerRef = useRef(opener)
  useEffect(() => {
    closeRef.current = onClose
    openerRef.current = opener
  })

  // Inside the window: flipped left / up when it would run off the edge (set on the element: no extra render).
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const box = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const x = at.x + box.width > vw - 4 ? Math.max(4, nested && flipX !== undefined ? flipX - box.width + 4 : vw - box.width - 4) : at.x
    const y = at.y + box.height > vh - 4 ? Math.max(4, vh - box.height - 4) : at.y
    el.style.left = `${x}px`
    el.style.top = `${y}px`
    // The first entry that can be used, else the first entry, else the menu itself: the keys always reach it.
    const first = el.querySelector<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])') ?? el.querySelector<HTMLElement>('[role^="menuitem"]') ?? el
    first.focus({ preventScroll: true })
  }, [at, nested, flipX])

  // A press outside closes it (the press is not swallowed); a press on the opener is the opener's.
  useEffect(() => {
    if (nested) return
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Element | null
      if (target?.closest("[data-board-menu]")) return
      const button = openerRef.current?.()
      if (button && target && button.contains(target)) return
      closeRef.current()
    }
    document.addEventListener("pointerdown", onPointerDown, true)
    return () => document.removeEventListener("pointerdown", onPointerDown, true)
  }, [nested])

  function close(refocus = true) {
    onClose()
    if (refocus) returnFocus?.()?.focus({ preventScroll: true })
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!MENU_KEYS.has(e.key)) return
    // A submenu's keys are its own (it is portalled, but React passes events up its tree).
    e.stopPropagation()
    const menuItems = Array.from(ref.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])
    const index = menuItems.indexOf(document.activeElement as HTMLElement)
    const move = (to: number) => {
      e.preventDefault()
      menuItems[(to + menuItems.length) % menuItems.length]?.focus()
    }
    if (e.key === "ArrowDown") move(index + 1)
    else if (e.key === "ArrowUp") move(index - 1)
    else if (e.key === "Home") move(0)
    else if (e.key === "End") move(menuItems.length - 1)
    else if (e.key === "Escape" || (nested && e.key === "ArrowLeft") || e.key === "Tab") {
      e.preventDefault()
      close()
    }
  }

  function choose(entry: Focusable, target: HTMLElement) {
    if (entry.disabled) return
    if (entry.kind === "submenu") {
      const box = target.getBoundingClientRect()
      // Hovering an open submenu's entry again changes nothing (the focus stays where it is).
      if (openSub?.key === entry.key) return
      setOpenSub({ key: entry.key, at: { x: box.right - 4, y: box.top - 4 }, flipX: box.left })
      return
    }
    if (closeAll) closeAll()
    else close()
    entry.onSelect()
  }

  const sub = openSub ? items.find((e): e is Extract<MenuEntry, { kind: "submenu" }> => e.kind === "submenu" && e.key === openSub.key) : undefined

  const menu = (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      data-board-menu=""
      id={menuId}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      className="fixed z-[120] min-w-52 max-w-[min(22rem,calc(100vw-1rem))] overflow-y-auto rounded-ui-md border border-border bg-surface py-1 shadow-ui-lg"
      style={{ left: at.x, top: at.y, maxHeight: "calc(100dvh - 1rem)" }}
    >
      {sections(items).map((section) =>
        section.heading ? (
          <div key={section.heading.key} role="group" aria-label={section.heading.label}>
            <div aria-hidden="true" className="px-3 pb-0.5 pt-1.5 text-caption font-semibold uppercase tracking-wide text-fg-muted">
              {section.heading.label}
            </div>
            {section.entries.map(renderEntry)}
          </div>
        ) : (
          section.entries.map(renderEntry)
        ),
      )}
    </div>
  )

  function renderEntry(entry: MenuEntry) {
        if (entry.kind === "separator") return <div key={entry.key} role="separator" className="my-1 h-px bg-border" />
        if (entry.kind === "heading") return null
        const isSub = entry.kind === "submenu"
        const open = isSub && openSub?.key === entry.key
        return (
          <div
            key={entry.key}
            role={entry.kind === "item" && entry.checked !== undefined ? "menuitemcheckbox" : "menuitem"}
            aria-checked={entry.kind === "item" && entry.checked !== undefined ? entry.checked : undefined}
            aria-haspopup={isSub ? "menu" : undefined}
            aria-expanded={isSub ? open : undefined}
            aria-controls={open ? `${menuId}-${entry.key}` : undefined}
            aria-disabled={entry.disabled || undefined}
            aria-keyshortcuts={entry.kind === "item" && entry.shortcut ? entry.shortcut.replace(/\s/g, "") : undefined}
            tabIndex={-1}
            data-menu-key={entry.key}
            onClick={(e) => choose(entry, e.currentTarget)}
            onPointerEnter={(e) => {
              e.currentTarget.focus({ preventScroll: true })
              if (closeSubTimer.current !== null) window.clearTimeout(closeSubTimer.current)
              closeSubTimer.current = null
              if (isSub) choose(entry, e.currentTarget)
              else if (openSub) closeSubTimer.current = window.setTimeout(() => setOpenSub(null), 250)
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " " || (isSub && e.key === "ArrowRight")) {
                e.preventDefault()
                e.stopPropagation()
                choose(entry, e.currentTarget)
              }
            }}
            className={cn(
              "flex min-h-9 cursor-default select-none items-center gap-2.5 px-3 text-body text-fg outline-none",
              "focus:bg-primary-soft focus:text-primary-strong focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
              entry.disabled && "cursor-not-allowed text-fg-muted opacity-60",
            )}
          >
            <span aria-hidden="true" className="inline-flex w-4 shrink-0 justify-center text-fg-muted">
              {entry.kind === "item" && entry.checked ? <Check className="h-4 w-4" /> : entry.icon}
            </span>
            <span className="min-w-0 flex-1 truncate">{entry.label}</span>
            {entry.kind === "item" && entry.shortcut && (
              <kbd aria-hidden="true" className="shrink-0 font-sans text-caption text-fg-muted">
                {entry.shortcut}
              </kbd>
            )}
            {isSub && <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-fg-muted" />}
          </div>
        )
  }
  // The page's root, so no toolbar or canvas clips it; a submenu is its own menu beside it (not inside an entry).
  if (typeof document === "undefined") return null
  return (
    <>
      {createPortal(menu, document.body)}
      {sub && openSub && (
        <BoardMenu
          id={`${menuId}-${sub.key}`}
          label={sub.label}
          items={sub.items}
          at={openSub.at}
          flipX={openSub.flipX}
          nested
          closeAll={closeAll ?? (() => close())}
          onClose={() => setOpenSub(null)}
          returnFocus={() => ref.current?.querySelector<HTMLElement>(`[data-menu-key="${sub.key}"]`)}
        />
      )}
    </>
  )
}

/** Entries split at their headings: the entries under a heading become one named group. */
function sections(items: readonly MenuEntry[]): { heading: Extract<MenuEntry, { kind: "heading" }> | null; entries: MenuEntry[] }[] {
  const out: { heading: Extract<MenuEntry, { kind: "heading" }> | null; entries: MenuEntry[] }[] = [{ heading: null, entries: [] }]
  for (const entry of items) {
    if (entry.kind === "heading") out.push({ heading: entry, entries: [] })
    else out[out.length - 1].entries.push(entry)
  }
  return out.filter((s) => s.heading || s.entries.length > 0)
}
