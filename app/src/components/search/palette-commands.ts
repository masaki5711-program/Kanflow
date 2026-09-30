import { buildSidebarGroups } from "@/components/app-shell/sidebar-nav"
import { languageLabels, type Language, type Translations } from "@/lib/i18n"
import type { ProjectTypeLabels } from "@/lib/project-type-labels"
import { fillTemplate as fill } from "@/lib/fill-template"

/** A static palette entry (no server round trip). */
export type PaletteCommandAction = { kind: "navigate"; href: string } | { kind: "language"; language: Language }

export interface PaletteCommand {
  id: string
  label: string
  action: PaletteCommandAction
}

export interface PaletteCommandContext {
  /** Current project from the URL (project pages only). */
  projectId: string | null
  t: Translations
  pt: ProjectTypeLabels
  language: Language
}

/**
 * Palette commands: every page of the current project (same list and labels
 * as the sidebar, so routes never drift), the project list, my profile, and
 * switching the display language.
 */
export function buildPaletteCommands({ projectId, t, pt, language }: PaletteCommandContext): PaletteCommand[] {
  const goTo = (id: string, page: string, href: string): PaletteCommand => ({
    id: `cmd:${id}`,
    label: fill(t.searchCmdGoTo, { page }),
    action: { kind: "navigate", href },
  })
  const projectPages = projectId
    ? buildSidebarGroups(projectId, t, pt).flatMap((g) => g.items.map((item) => goTo(item.href, item.label, item.href)))
    : []
  const languages = (Object.keys(languageLabels) as Language[])
    .filter((l) => l !== language)
    .map(
      (l): PaletteCommand => ({
        id: `cmd:lang:${l}`,
        label: fill(t.searchCmdLanguage, { language: languageLabels[l] }),
        action: { kind: "language", language: l },
      })
    )
  return [...projectPages, goTo("/", t.projectListTitle, "/"), goTo("/me", t.myProfileMenu, "/me"), ...languages]
}

/** Case-insensitive substring match on the label (all commands for an empty query). */
export function filterCommands(commands: readonly PaletteCommand[], query: string): PaletteCommand[] {
  const q = query.trim().toLowerCase()
  if (!q) return [...commands]
  return commands.filter((c) => c.label.toLowerCase().includes(q))
}

/** Current project id from a pathname (`/projects/:id/...`), else null. */
export function projectIdFromPath(pathname: string | null): string | null {
  const m = /^\/projects\/([^/?#]+)/.exec(pathname ?? "")
  return m ? decodeURIComponent(m[1]) : null
}
