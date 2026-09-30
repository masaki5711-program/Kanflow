import type { Language } from "./i18n"
import type { ProjectTypeLabels } from "./project-type-labels"

export type ProjectRole = "po" | "sm" | "dev"

/** Full, localized project-role name (A3-07): never mixes languages. */
export function projectRoleLabel(role: string, labels: Pick<ProjectTypeLabels, "rolePO" | "roleSM" | "roleDev">): string {
  if (role === "po") return labels.rolePO
  if (role === "sm") return labels.roleSM
  if (role === "dev") return labels.roleDev
  return role
}

const ROLE_SHORT: Record<Language, Record<ProjectRole, string>> = {
  ja: { po: "PO", sm: "SM", dev: "開発" },
  en: { po: "PO", sm: "SM", dev: "Dev" },
  id: { po: "PO", sm: "SM", dev: "Dev" },
}

/** Compact role chip text (home cards). PO / SM are the guide's own abbreviations. */
export function projectRoleShortLabel(role: string, language: Language): string {
  return (ROLE_SHORT[language] ?? ROLE_SHORT.ja)[role as ProjectRole] ?? role
}
