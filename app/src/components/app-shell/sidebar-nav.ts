import type { ComponentType } from "react"
import {
  BookOpen,
  CalendarDays,
  ChartGantt,
  FileText,
  LayoutDashboard,
  Lightbulb,
  ListOrdered,
  Map as MapIcon,
  MessageSquare,
  Rocket,
  Settings,
  Trash2,
  TrendingDown,
  Zap,
} from "lucide-react"
import type { Translations } from "@/lib/i18n"
import type { ProjectTypeLabels } from "@/lib/project-type-labels"

export interface SidebarNavItem {
  href: string
  label: string
  description: string
  Icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>
  /** Exact match only (the dashboard is the project root). */
  exact?: boolean
}

export interface SidebarNavGroup {
  id: SidebarGroupId
  label: string
  items: SidebarNavItem[]
}

export const SIDEBAR_GROUP_IDS = ["plan", "execute", "review", "manage"] as const
export type SidebarGroupId = (typeof SIDEBAR_GROUP_IDS)[number]

export interface SidebarNavOptions {
  /** Add the project trash entry (only for users with the "trash.manage" permission). */
  showTrash?: boolean
  /** Team settings entry; false for section managers who are not members (A3-13). Default true. */
  showSettings?: boolean
  /** AI chat entry; false without the "ai.use" permission (A3-13). Default true. */
  showChat?: boolean
}

/**
 * Sidebar information architecture, four collapsible sections:
 * 計画 (overview and schedule) → 実行 (backlog, sprints) → 振り返り・AI → 管理.
 * The trash, team settings and AI chat entries are permission-gated.
 */
export function buildSidebarGroups(
  projectId: string,
  t: Translations,
  pt: ProjectTypeLabels,
  options: SidebarNavOptions = {},
): SidebarNavGroup[] {
  const base = `/projects/${projectId}`
  const { showTrash = false, showSettings = true, showChat = true } = options
  const trash: SidebarNavItem[] = showTrash
    ? [{ href: `${base}/trash`, label: t.trashTitle, description: t.trashNavDescription, Icon: Trash2 }]
    : []
  const settings: SidebarNavItem[] = showSettings
    ? [{ href: `${base}/settings`, label: t.navSettings, description: t.navDescSettings, Icon: Settings }]
    : []
  const chat: SidebarNavItem[] = showChat
    ? [{ href: `${base}/chat`, label: t.chatTitle, description: t.navDescChat, Icon: MessageSquare }]
    : []
  return [
    {
      id: "plan",
      label: t.navGroupPlan,
      items: [
        { href: base, label: t.navDashboard, description: t.navDescDashboard, Icon: LayoutDashboard, exact: true },
        { href: `${base}/plan`, label: t.planTitle, description: t.navDescPlan, Icon: MapIcon },
        { href: `${base}/gantt`, label: t.ganttTitle, description: t.navDescGantt, Icon: ChartGantt },
        { href: `${base}/calendar`, label: t.calendarTitle, description: t.navDescCalendar, Icon: CalendarDays },
        { href: `${base}/releases`, label: pt.navReleases, description: t.navDescReleases, Icon: Rocket },
      ],
    },
    {
      id: "execute",
      label: t.navGroupExecute,
      items: [
        { href: `${base}/backlog`, label: pt.navBacklog, description: t.navDescBacklog, Icon: ListOrdered },
        { href: `${base}/icebox`, label: pt.navIcebox, description: t.iceboxDescription, Icon: Lightbulb },
        { href: `${base}/sprints`, label: pt.navSprints, description: t.navDescSprints, Icon: Zap },
        { href: `${base}/burndown`, label: t.burndownPageTitle, description: t.navDescBurndown, Icon: TrendingDown },
      ],
    },
    {
      id: "review",
      label: t.navGroupReview,
      items: [
        { href: `${base}/report`, label: t.reportTitle, description: t.navDescReport, Icon: FileText },
        ...chat,
      ],
    },
    {
      id: "manage",
      label: t.navGroupManage,
      items: [
        ...settings,
        ...trash,
        { href: `${base}/guide`, label: t.guideTitle, description: t.navDescGuide, Icon: BookOpen },
      ],
    },
  ]
}

export function isNavItemActive(pathname: string, item: Pick<SidebarNavItem, "href" | "exact">): boolean {
  if (item.exact) return pathname === item.href
  return pathname === item.href || pathname.startsWith(`${item.href}/`)
}

/** Id of the section holding the current page (undefined outside the project menu). */
export function findActiveGroupId(groups: readonly SidebarNavGroup[], pathname: string): SidebarGroupId | undefined {
  return groups.find((g) => g.items.some((item) => isNavItemActive(pathname, item)))?.id
}
