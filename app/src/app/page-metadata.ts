import type { Metadata } from "next"
import { getTranslations, type Language, type Translations } from "@/lib/i18n"
import { formatDocumentTitle } from "@/lib/i18n/document-title"
import { getProjectTypeLabels, type ProjectType, type ProjectTypeLabels } from "@/lib/project-type-labels"
import { pickText } from "@/lib/translation/pick-text"

export type PageTitlePicker = (labels: { t: Translations; pt: ProjectTypeLabels }) => string

const LANGUAGES: readonly Language[] = ["ja", "en", "id"]

function toLanguage(value: string | null | undefined): Language {
  return LANGUAGES.includes(value as Language) ? (value as Language) : "ja"
}

/*
 * Server-only modules are imported lazily so that page modules which export
 * `generateMetadata` stay importable in component tests (no DB client at load).
 */
interface Viewer {
  userId: string | null
  systemRole: string
  language: Language
}

async function loadViewer(): Promise<Viewer> {
  const [{ auth }, { prisma }] = await Promise.all([import("@/lib/auth"), import("@/lib/prisma")])
  const session = await auth()
  if (!session?.user?.id) return { userId: null, systemRole: "member", language: "ja" }
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { language: true } })
  return { userId: session.user.id, systemRole: session.user.role ?? "member", language: toLanguage(user?.language) }
}

/** Only viewers of the project may see its name (same rule as the project layout). */
async function mayViewProject(viewer: Viewer, projectId: string): Promise<boolean> {
  if (!viewer.userId) return false
  const { can, loadProjectActor } = await import("@/lib/authz")
  const actor = await loadProjectActor(viewer.userId, viewer.systemRole, projectId)
  return can(actor, "project.view")
}

/**
 * Server-side document title "<Page> · <Project> · Kanflow" in the viewer's
 * language (read-only lookups). Client pages refine it with `useDocumentTitle`
 * when the language changes (project override / user switch).
 * Never throws: on any lookup failure it falls back to the app name.
 */
export async function buildPageMetadata(pick: PageTitlePicker, projectId?: string): Promise<Metadata> {
  try {
    const viewer = await loadViewer()
    const { language } = viewer
    const t = getTranslations(language)
    if (!projectId) {
      return { title: formatDocumentTitle([pick({ t, pt: getProjectTypeLabels("software", language) })]) }
    }
    const [{ prisma }, { getI18nFor }] = await Promise.all([import("@/lib/prisma"), import("@/lib/translation/hooks")])
    // A project the viewer cannot see is titled exactly like an unknown id.
    if (!(await mayViewProject(viewer, projectId))) {
      return { title: formatDocumentTitle([pick({ t, pt: getProjectTypeLabels("software", language) }), null]) }
    }
    const [project, i18nMap] = await Promise.all([
      prisma.project.findUnique({ where: { id: projectId, deletedAt: null }, select: { name: true, projectType: true } }),
      getI18nFor("project", [projectId]),
    ])
    const pt = getProjectTypeLabels((project?.projectType as ProjectType) ?? "software", language)
    const projectName = project ? pickText(i18nMap.get(projectId), "name", project.name, language).text : null
    return { title: formatDocumentTitle([pick({ t, pt }), projectName]) }
  } catch {
    return { title: formatDocumentTitle([]) }
  }
}
