"use client"

import { useState, type FocusEvent, type MouseEvent } from "react"
import Link from "next/link"
import { cn } from "@/components/ui"
import { isNavItemActive, type SidebarNavGroup, type SidebarNavItem } from "@/components/app-shell/sidebar-nav"

interface Tip {
  label: string
  description: string
  top: number
  left: number
}

/**
 * Icon-only sidebar (collapsed desktop rail). Every page stays one click away:
 * the pinned entries, then each section's items separated by a divider (section
 * headings are not shown; the list carries the section name for screen
 * readers). The current page keeps its highlight, counts shrink to a corner
 * pill, and hovering or focusing an icon shows its name and description in a
 * tooltip next to the rail (fixed-positioned so the scrolling nav cannot clip it).
 */
export function SidebarRailNav({ groups, pinned, pathname }: { groups: SidebarNavGroup[]; pinned: SidebarNavItem[]; pathname: string }) {
  const [tip, setTip] = useState<Tip | null>(null)
  const show = (item: SidebarNavItem) => (e: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    setTip({ label: item.label, description: item.description, top: r.top + r.height / 2, left: r.right + 10 })
  }
  const hide = () => setTip(null)
  const sections: Array<{ id: string; label?: string; items: SidebarNavItem[] }> = [
    { id: "pinned", items: pinned },
    ...groups.map((g) => ({ id: g.id, label: g.label, items: g.items })),
  ]
  return (
    <>
      {sections.map((section, index) => (
        <ul
          key={section.id}
          aria-label={section.label}
          data-sidebar-rail-group={section.id}
          className={cn("flex flex-col items-center gap-1", index > 0 && "mt-2 border-t border-border pt-2")}
        >
          {section.items.map((item) => (
            <li key={item.href}>
              <RailLink item={item} active={isNavItemActive(pathname, item)} onShow={show(item)} onHide={hide} />
            </li>
          ))}
        </ul>
      ))}
      {tip && (
        <div
          role="tooltip"
          style={{ top: tip.top, left: tip.left }}
          className="pointer-events-none fixed z-50 max-w-64 -translate-y-1/2 rounded-ui-md bg-fg px-2.5 py-1.5 text-caption text-surface shadow-ui-overlay"
        >
          <p className="font-semibold">{tip.label}</p>
          <p className="opacity-80">{tip.description}</p>
        </div>
      )}
    </>
  )
}

interface RailLinkProps {
  item: SidebarNavItem
  active: boolean
  onShow: (e: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>) => void
  onHide: () => void
}

function RailLink({ item, active, onShow, onHide }: RailLinkProps) {
  const { Icon, badge } = item
  const hasBadge = !!badge && badge.count > 0
  return (
    <Link
      href={item.href}
      aria-label={hasBadge ? `${item.label}, ${badge.label}` : item.label}
      aria-current={active ? "page" : undefined}
      onMouseEnter={onShow}
      onMouseLeave={onHide}
      onFocus={onShow}
      onBlur={onHide}
      onClick={onHide}
      className={cn(
        "group relative grid h-10 w-10 place-items-center rounded-ui-md transition-colors",
        active ? "bg-primary-soft text-primary-strong" : "text-fg-subtle hover:bg-surface-sunken hover:text-fg",
      )}
    >
      {active && <span aria-hidden="true" className="absolute -left-2 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-full bg-primary" />}
      <Icon aria-hidden className="h-5 w-5" />
      {hasBadge && (
        <span
          data-sidebar-badge=""
          data-tone={badge.tone ?? "primary"}
          aria-hidden="true"
          className={cn(
            "absolute -right-1 -top-1 min-w-[18px] rounded-full px-1 text-center text-[10px] font-semibold leading-[18px] tabular-nums text-white ring-2 ring-surface",
            badge.tone === "alert" || badge.tone === "danger" ? "bg-danger" : "bg-primary",
          )}
        >
          {badge.tone === "alert" ? "@" : badge.count > 99 ? "99+" : badge.count}
        </span>
      )}
    </Link>
  )
}
