import type { Language, Translations } from "@/lib/i18n"
import { projectTypeOptions, type ProjectType } from "@/lib/project-type-labels"
import type { EntityI18n } from "@/lib/translation/types"
import type { CategoryDto } from "@/types/api"

export interface Project {
  id: string
  name: string
  description: string | null
  /** Both-language text (name / description) from the server page. */
  i18n?: EntityI18n
  status: string
  projectType: string
  members: {
    role: string
    user: { id: string; name: string }
  }[]
  _count: {
    iceboxItems: number
    backlogItems: number
    sprints: number
    aiReports?: number
  }
  progressPct: number
  cardColor?: string | null
  sections?: { id: string; name: string }[]
  isFavorite?: boolean
  /** Latest autonomous AI report (for the list badge). */
  aiReports?: { id: string; title: string }[]
  /** Date (server page) or ISO string (JSON API). */
  createdAt?: string | Date
  updatedAt?: string | Date
  /** max(newest ActivityLog row, updatedAt) — drives "last updated" and dormancy. */
  lastActivityAt?: string | Date
  /** When it was moved to the archive (archived list; null / absent when unknown). */
  archivedAt?: string | Date | null
  /** Viewer may archive / restore it (project.update: admin, PO, SM). */
  canUpdate?: boolean
  /** Viewer's own project role (po / sm / dev); null / absent when they only see it (section manager / admin). */
  myRole?: string | null
}

export type Category = CategoryDto

/** Grouping of the list: none, the user's categories, or the viewer's own project role. */
export type ViewMode = "flat" | "category" | "role"
/** Card grid or dense one-row-per-project list. */
export type Layout = "card" | "list"
export type SortBy = "updated" | "name" | "progress" | "name_asc" | "favorite" | "activity_desc" | "activity_asc"
export type TypeFilter = "all" | ProjectType

export const CARD_COLORS = ["gray", "red", "orange", "yellow", "green", "blue", "indigo", "purple", "pink"] as const
export type CardColor = (typeof CARD_COLORS)[number]

const COLOR_LABEL_KEY: Record<CardColor, keyof Translations> = {
  gray: "projectColorGray",
  red: "projectColorRed",
  orange: "projectColorOrange",
  yellow: "projectColorYellow",
  green: "projectColorGreen",
  blue: "projectColorBlue",
  indigo: "projectColorIndigo",
  purple: "projectColorPurple",
  pink: "projectColorPink",
}

export function colorLabel(t: Translations, color: CardColor): string {
  return t[COLOR_LABEL_KEY[color]] as string
}

export const colorMap: Record<string, string> = {
  gray: "bg-gray-100 text-gray-700 border-gray-200",
  red: "bg-red-50 text-red-700 border-red-200",
  orange: "bg-orange-50 text-orange-700 border-orange-200",
  yellow: "bg-yellow-50 text-yellow-800 border-yellow-200",
  green: "bg-green-50 text-green-700 border-green-200",
  blue: "bg-blue-50 text-blue-700 border-blue-200",
  indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
  purple: "bg-purple-50 text-purple-700 border-purple-200",
  pink: "bg-pink-50 text-pink-700 border-pink-200",
}

export const colorDot: Record<string, string> = {
  gray: "bg-gray-400",
  red: "bg-red-500",
  orange: "bg-orange-500",
  yellow: "bg-yellow-500",
  green: "bg-green-500",
  blue: "bg-blue-500",
  indigo: "bg-indigo-500",
  purple: "bg-purple-500",
  pink: "bg-pink-500",
}

/** Card background tint per cardColor (comfortable card view). */
export const cardTint: Record<string, string> = {
  gray: "bg-gray-50 border-gray-200",
  red: "bg-red-50/70 border-red-200",
  orange: "bg-orange-50/70 border-orange-200",
  yellow: "bg-yellow-50/70 border-yellow-200",
  green: "bg-green-50/70 border-green-200",
  blue: "bg-blue-50/70 border-blue-200",
  indigo: "bg-indigo-50/70 border-indigo-200",
  purple: "bg-purple-50/70 border-purple-200",
  pink: "bg-pink-50/70 border-pink-200",
}

/** Member chips on project cards: kit tokens, AA contrast (≥ 6:1) at caption size. */
export const roleStyle: Record<string, string> = {
  po: "bg-warning-soft text-warning-strong ring-warning/30",
  sm: "bg-success-soft text-success-strong ring-success/30",
  dev: "bg-surface-sunken text-fg-muted ring-border",
}

const TYPE_EMOJI: Record<string, string> = {
  software: "💻",
  process_improvement: "🏭",
}

export function projectTypeEmoji(type: string): string {
  return TYPE_EMOJI[type] ?? "📋"
}

export function projectTypeLabel(type: string, language: Language): string {
  const opt = projectTypeOptions.find((o) => o.value === type)
  if (!opt) return type
  return language === "ja" ? opt.labelJa : language === "id" ? opt.labelId : opt.labelEn
}

export function clampPct(pct: number | null | undefined): number {
  return Math.min(100, Math.max(0, pct ?? 0))
}

/** Latest AI report title flags a red (critical) finding. */
export function hasCriticalAiReport(p: Project): boolean {
  return p.aiReports?.[0]?.title.includes("🔴") ?? false
}
