"use client"

import { useEffect, useRef } from "react"
import Link from "next/link"
import { ChevronDown, ChevronsDownUp, ChevronsUpDown } from "lucide-react"
import { useLanguage } from "@/lib/language-context"
import { cn } from "@/components/ui"
import {
  SIDEBAR_GROUP_IDS,
  findActiveGroupId,
  isNavItemActive,
  type SidebarNavGroup,
  type SidebarNavItem,
} from "@/components/app-shell/sidebar-nav"
import { useCollapsedGroups, type CollapsedGroups } from "@/components/app-shell/sidebar-collapse"

/**
 * Sidebar sections. Visual hierarchy (user feedback: headings looked like links):
 * - section heading = muted, letter-spaced caption label with a round chevron
 *   button on the right; no item-like hover fill, divider above every section
 * - items = icon + label rows indented under a guide line; the active one has a
 *   primary-soft fill, primary-strong text and an accent bar on the guide line.
 */
export function SidebarSections({ groups, pinned = [], pathname, idPrefix }: { groups: SidebarNavGroup[]; pinned?: SidebarNavItem[]; pathname: string; idPrefix: string }) {
  const collapse = useCollapsedGroups()
  useAutoExpandOnNavigate(groups, pathname, collapse)
  return (
    <>
      {pinned.length > 0 && (
        <ul className="mb-2 space-y-0.5 border-b border-border pb-2" data-sidebar-home="">
          {pinned.map((item) => (
            <li key={item.href}>
              <SidebarLink item={item} active={isNavItemActive(pathname, item)} idPrefix={idPrefix} />
            </li>
          ))}
        </ul>
      )}
      <ExpandAllControl collapse={collapse} />
      {groups.map((group, index) => (
        <SidebarGroup key={group.id} group={group} pathname={pathname} idPrefix={idPrefix} collapse={collapse} isFirst={index === 0} />
      ))}
    </>
  )
}

/**
 * Navigating (palette, links on the page) into a collapsed section opens it.
 * Not on mount: a section the user collapsed while on this page stays closed
 * and only shows the current page.
 */
function useAutoExpandOnNavigate(groups: SidebarNavGroup[], pathname: string, collapse: CollapsedGroups) {
  const previous = useRef(pathname)
  const { isCollapsed, expand } = collapse
  useEffect(() => {
    if (previous.current === pathname) return
    previous.current = pathname
    const activeId = findActiveGroupId(groups, pathname)
    if (activeId && isCollapsed(activeId)) expand(activeId)
  }, [pathname, groups, isCollapsed, expand])
}

function ExpandAllControl({ collapse }: { collapse: CollapsedGroups }) {
  const { t } = useLanguage()
  const { anyCollapsed, setAll } = collapse
  const Icon = anyCollapsed ? ChevronsUpDown : ChevronsDownUp
  return (
    <div className="mb-1 flex justify-end px-1">
      <button
        type="button"
        onClick={() => setAll(anyCollapsed ? [] : SIDEBAR_GROUP_IDS)}
        className="inline-flex min-h-7 items-center gap-1 rounded-ui-sm px-2 text-caption text-fg-muted transition-colors hover:bg-surface-sunken hover:text-fg"
      >
        <Icon aria-hidden className="h-3.5 w-3.5" />
        {anyCollapsed ? t.navExpandAll : t.navCollapseAll}
      </button>
    </div>
  )
}

interface SidebarGroupProps {
  group: SidebarNavGroup
  pathname: string
  idPrefix: string
  collapse: CollapsedGroups
  isFirst: boolean
}

/**
 * One collapsible section. The whole heading row is a disclosure button (not a
 * heading element: the page's own h1 must be the first heading); the list is
 * labelled by it. A collapsed section still shows the current page as a single
 * highlighted item so the user never loses their place.
 */
function SidebarGroup({ group, pathname, idPrefix, collapse, isFirst }: SidebarGroupProps) {
  const collapsed = collapse.isCollapsed(group.id)
  const labelId = `${idPrefix}-group-${group.id}`
  const listId = `${idPrefix}-list-${group.id}`
  const items = collapsed ? group.items.filter((item) => isNavItemActive(pathname, item)) : group.items
  const hiddenCount = group.items.length - items.length
  return (
    <div className={cn(!isFirst && "mt-3 border-t border-border pt-3")} data-sidebar-group={group.id}>
      <button
        type="button"
        onClick={() => collapse.toggle(group.id)}
        aria-expanded={!collapsed}
        aria-controls={listId}
        className="group/heading flex w-full min-h-8 items-center gap-2 rounded-ui-sm px-2 py-1 text-left"
      >
        <span id={labelId} className="min-w-0 flex-1 truncate text-caption font-semibold uppercase tracking-[0.14em] text-fg-subtle group-hover/heading:text-fg-muted">
          {group.label}
        </span>
        {collapsed && hiddenCount > 0 && (
          <span aria-hidden="true" className="rounded-full bg-surface-sunken px-1.5 text-caption tabular-nums text-fg-muted">
            {hiddenCount}
          </span>
        )}
        <span
          aria-hidden="true"
          className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-border bg-surface text-fg-muted transition-colors group-hover/heading:border-border-strong group-hover/heading:text-fg"
        >
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200 ease-out", collapsed && "-rotate-90")} />
        </span>
      </button>
      <ul
        id={listId}
        aria-labelledby={labelId}
        hidden={items.length === 0}
        className="ml-3.5 mt-1 space-y-0.5 border-l border-border pl-2"
      >
        {items.map((item) => (
          <li key={item.href}>
            <SidebarLink item={item} active={isNavItemActive(pathname, item)} idPrefix={idPrefix} />
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Single-line nav item. The accessible name is the label only; the one-line
 * description is a hover tooltip (inactive items) or shown under the active
 * item and referenced via aria-describedby - never both, so it is read once.
 */
function SidebarLink({ item, active, idPrefix }: { item: SidebarNavItem; active: boolean; idPrefix: string }) {
  const { Icon } = item
  const descId = `${idPrefix}-desc-${item.href.replace(/[^a-z0-9]/gi, "-")}`
  return (
    <>
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        aria-describedby={active ? descId : undefined}
        title={active ? undefined : item.description}
        className={cn(
          "group relative flex min-h-9 items-center gap-2.5 rounded-ui-sm px-2.5 py-1.5 text-body font-medium transition-colors",
          active ? "bg-primary-soft text-primary-strong" : "text-fg-muted hover:bg-surface-sunken hover:text-fg",
        )}
      >
        {active && (
          <span aria-hidden="true" className="absolute -left-[10px] top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-full bg-primary" />
        )}
        <Icon
          aria-hidden
          className={cn("h-[18px] w-[18px] shrink-0", active ? "text-primary-strong" : "text-fg-subtle group-hover:text-fg-muted")}
        />
        <span className="min-w-0 truncate">{item.label}</span>
        {item.badge && item.badge.count > 0 && (
          <span data-sidebar-badge="" data-tone={item.badge.tone ?? "primary"} title={item.badge.label} className={cn("ml-auto shrink-0 rounded-full px-1.5 text-caption font-semibold leading-5 tabular-nums text-white", item.badge.tone === "alert" || item.badge.tone === "danger" ? "bg-danger" : "bg-primary")}>
            {item.badge.tone === "alert" && <span aria-hidden="true">@</span>}
            <span aria-hidden="true">{item.badge.count > 99 ? "99+" : item.badge.count}</span>
            <span className="sr-only">{item.badge.label}</span>
          </span>
        )}
      </Link>
      {active && (
        <p id={descId} className="pb-1 pl-[2.375rem] pr-2 pt-0.5 text-caption text-fg-muted">
          {item.description}
        </p>
      )}
    </>
  )
}
