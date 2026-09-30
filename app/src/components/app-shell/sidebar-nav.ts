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
}

/**
 * Sidebar information architecture, four collapsible sections:
 * 計画 (overview and schedule) → 実行 (backlog, sprints) → 振り返り・AI → 管理.
 * Every project route stays reachable; only the trash is permission-gated.
 */
export function buildSidebarGroups(
  projectId: string,
  t: Translations,
  pt: ProjectTypeLabels,
  options: SidebarNavOptions = {},
): SidebarNavGroup[] {
  const base = `/projects/${projectId}`
  const trash: SidebarNavItem[] = options.showTrash
    ? [{ href: `${base}/trash`, label: t.trashTitle, description: t.trashNavDescription, Icon: Trash2 }]
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
        { href: `${base}/chat`, label: t.chatTitle, description: t.navDescChat, Icon: MessageSquare },
      ],
    },
    {
      id: "manage",
      label: t.navGroupManage,
      items: [
        { href: `${base}/settings`, label: t.navSettings, description: t.navDescSettings, Icon: Settings },
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
