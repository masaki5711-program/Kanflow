import type { Language } from "./i18n"
import type { ProjectType, ProjectTypeLabels } from "./project-type-labels"

export type ProjectRole = "po" | "sm" | "dev"

/** Full, localized project-role name (A3-07): never mixes languages. */
export function projectRoleLabel(role: string, labels: Pick<ProjectTypeLabels, "rolePO" | "roleSM" | "roleDev">): string {
  if (role === "po") return labels.rolePO
  if (role === "sm") return labels.roleSM
  if (role === "dev") return labels.roleDev
  return role
}

type ShortSet = Record<ProjectRole, string>

/** Scrum projects: the guide's own abbreviations, one script in every language. */
const SCRUM_SHORT: ShortSet = { po: "PO", sm: "SM", dev: "Dev" }

/**
 * Short role names per project type and language (home member chips). Each
 * set stays in one script / language (A3-07: 「開発」 next to 「PO」 read mixed).
 * Non-software projects shorten their own role names (改善オーナー → オーナー …).
 */
const ROLE_SHORT: Record<ProjectType, Record<Language, ShortSet>> = {
  software: { ja: SCRUM_SHORT, en: SCRUM_SHORT, id: SCRUM_SHORT },
  process_improvement: {
    ja: { po: "オーナー", sm: "ファシリ", dev: "メンバー" },
    en: { po: "Owner", sm: "Facilitator", dev: "Member" },
    id: { po: "Pemilik", sm: "Fasilitator", dev: "Anggota" },
  },
  equipment: {
    ja: { po: "責任者", sm: "進行", dev: "メンバー" },
    en: { po: "Owner", sm: "Coordinator", dev: "Member" },
    id: { po: "Penanggung jawab", sm: "Koordinator", dev: "Anggota" },
  },
  general: {
    ja: { po: "オーナー", sm: "ファシリ", dev: "メンバー" },
    en: { po: "Owner", sm: "Facilitator", dev: "Member" },
    id: { po: "Pemilik", sm: "Fasilitator", dev: "Anggota" },
  },
}

/** Compact role chip text (home cards); the full name goes in the tooltip (`projectRoleLabel`). */
export function projectRoleShortLabel(role: string, language: Language, projectType: string = "software"): string {
  const byType = ROLE_SHORT[projectType as ProjectType] ?? ROLE_SHORT.software
  return (byType[language] ?? byType.ja)[role as ProjectRole] ?? role
}
