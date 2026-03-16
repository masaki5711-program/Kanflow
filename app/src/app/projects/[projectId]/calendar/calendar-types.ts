// ── Shared Types & Constants for Calendar ─────────────────────────

export interface CalendarEvent {
  id: string
  title: string
  description: string | null
  date: string
  endDate: string | null
  color: string
  sprintId: string | null
  sprint: { id: string; sprintName: string } | null
}

export interface SprintItem {
  id: string
  status: string
  pbItem: {
    id: string
    displayId: number | null
    initiative: string | null
    epic: string | null
    userStory: string
    workloadScore: number | null
  }
}

export interface Sprint {
  id: string
  sprintName: string
  startDate: string
  endDate: string
  status: string
  items: SprintItem[]
}

export interface ProjectMember {
  id: string
  role: string
  user: { id: string; name: string | null; email: string; avatarUrl?: string | null }
}

export interface EventFormState {
  title: string
  description: string
  date: string
  endDate: string
  color: string
  sprintId: string
}

export type ViewMode = "month" | "week" | "team"

export const EVENT_COLORS = ["blue", "green", "red", "yellow", "purple", "gray"] as const

export const eventColorBorder: Record<string, string> = {
  blue: "border-l-blue-500",
  green: "border-l-green-500",
  red: "border-l-red-500",
  yellow: "border-l-yellow-500",
  purple: "border-l-purple-500",
  gray: "border-l-gray-500",
}

export const eventColorBg: Record<string, string> = {
  blue: "bg-blue-50 text-blue-800",
  green: "bg-green-50 text-green-800",
  red: "bg-red-50 text-red-800",
  yellow: "bg-yellow-50 text-yellow-800",
  purple: "bg-purple-50 text-purple-800",
  gray: "bg-gray-50 text-gray-800",
}

export const eventColorDot: Record<string, string> = {
  blue: "bg-blue-500",
  green: "bg-green-500",
  red: "bg-red-500",
  yellow: "bg-yellow-500",
  purple: "bg-purple-500",
  gray: "bg-gray-500",
}

export const sprintStatusColor: Record<string, string> = {
  planning: "bg-amber-400",
  active: "bg-blue-500",
  review: "bg-violet-500",
  done: "bg-emerald-500",
}

export const sprintGradient: Record<string, string> = {
  planning: "from-amber-300/70 to-amber-100/30",
  active: "from-blue-300/70 to-blue-100/30",
  review: "from-violet-300/70 to-violet-100/30",
  done: "from-emerald-300/70 to-emerald-100/30",
}

export const sprintTextColor: Record<string, string> = {
  planning: "text-amber-800",
  active: "text-blue-800",
  review: "text-violet-800",
  done: "text-emerald-800",
}

export const memberGradients = [
  "from-indigo-500 to-indigo-600",
  "from-blue-500 to-blue-600",
  "from-teal-500 to-teal-600",
  "from-emerald-500 to-emerald-600",
  "from-amber-500 to-amber-600",
  "from-rose-500 to-rose-600",
  "from-purple-500 to-purple-600",
  "from-cyan-500 to-cyan-600",
]

export const memberBlockColors = [
  "bg-indigo-100/80 border-indigo-400 text-indigo-800",
  "bg-blue-100/80 border-blue-400 text-blue-800",
  "bg-teal-100/80 border-teal-400 text-teal-800",
  "bg-emerald-100/80 border-emerald-400 text-emerald-800",
  "bg-amber-100/80 border-amber-400 text-amber-800",
  "bg-rose-100/80 border-rose-400 text-rose-800",
  "bg-purple-100/80 border-purple-400 text-purple-800",
  "bg-cyan-100/80 border-cyan-400 text-cyan-800",
]

export const emptyForm: EventFormState = {
  title: "",
  description: "",
  date: "",
  endDate: "",
  color: "blue",
  sprintId: "",
}

// ── Helpers ────────────────────────────────────────────────────────

export function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function parseLocalDate(str: string): Date {
  const [y, m, d] = str.split("T")[0].split("-").map(Number)
  return new Date(y, m - 1, d)
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function buildCalendarDays(year: number, month: number): Date[] {
  const firstOfMonth = new Date(year, month, 1)
  const startDay = firstOfMonth.getDay()
  const start = new Date(year, month, 1 - startDay)
  const days: Date[] = []
  for (let i = 0; i < 42; i++) {
    days.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
  }
  return days
}

export function getWeekStart(d: Date): Date {
  const day = d.getDay()
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day)
}

export function getInitials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
    return name.slice(0, 2).toUpperCase()
  }
  return email.slice(0, 2).toUpperCase()
}
