import type { EntityI18n } from "@/lib/translation/types"
import type { ProductGoalDto } from "@/types/api"
import type { Sparkline } from "./dashboard-summary"

export type ProductGoal = ProductGoalDto

export interface Attachment {
  id: string
  originalName: string
  fileName: string
  fileSize: number
  mimeType: string
  folderId: string | null
  createdAt: string
}

export interface Folder {
  id: string
  name: string
  parentId?: string | null
  sortOrder?: number
  attachments: Attachment[]
}

export interface ActiveSprint {
  id: string
  name: string
  goal: string | null
  i18n?: EntityI18n
  startDate: string
  endDate: string
  capacity: number
  taskCounts: { todo: number; inProgress: number; done: number }
  /** Burndown of this sprint (ideal vs actual remaining tasks). */
  sparkline?: Sparkline
}

/** One of my open tasks in this project (planning / active sprints). */
export interface DashboardMyTask {
  id: string
  taskName: string | null
  status: string
  pbDisplayId: number
  pbUserStory: string | null
  i18n?: EntityI18n
  pbI18n?: EntityI18n
}

/** Where a folder drop lands relative to the target folder header. */
export type FolderDropMode = "before" | "after" | "nest"

/** Accept list shared by every upload input on the dashboard. */
export const UPLOAD_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,image/*,video/*,audio/*"

export function isPreviewable(mime: string): boolean {
  return mime.startsWith("image/") || mime.startsWith("video/") || mime.startsWith("audio/")
}

export function isEditableInBrowser(mimeType: string): boolean {
  return ["word", "document", "spreadsheet", "excel", "presentation", "powerpoint"].some((k) => mimeType.includes(k))
}

/**
 * Format an ISO date string deterministically. `toLocaleDateString()` differs
 * between the SSR runtime (server's locale) and the browser (user's locale),
 * which causes React hydration mismatches. A fixed YYYY/MM/DD pattern keeps
 * server and client output identical.
 */
export function formatDateLocal(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso.slice(0, 10)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, "0")
  const day = String(d.getUTCDate()).padStart(2, "0")
  return `${y}/${m}/${day}`
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Children of each parent id (null = root), sorted by sortOrder. */
export function buildFolderChildMap(folders: Folder[]): Map<string | null, Folder[]> {
  const map = new Map<string | null, Folder[]>()
  for (const f of folders) {
    const key = f.parentId ?? null
    map.set(key, [...(map.get(key) ?? []), f])
  }
  for (const [key, list] of map) {
    map.set(key, [...list].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)))
  }
  return map
}

/** True when `candidateId` is `folderId` itself or one of its descendants. */
export function isSelfOrDescendant(folders: Folder[], folderId: string, candidateId: string | null): boolean {
  let cursor: string | null = candidateId
  const seen = new Set<string>()
  while (cursor && !seen.has(cursor)) {
    if (cursor === folderId) return true
    seen.add(cursor)
    const current: string = cursor
    cursor = folders.find((f) => f.id === current)?.parentId ?? null
  }
  return false
}

/** Depth-first flattened folder list with depth — used for "move to" selects. */
export function flattenFolders(folders: Folder[]): { folder: Folder; depth: number }[] {
  const childMap = buildFolderChildMap(folders)
  const out: { folder: Folder; depth: number }[] = []
  const visit = (parentId: string | null, depth: number) => {
    for (const f of childMap.get(parentId) ?? []) {
      out.push({ folder: f, depth })
      visit(f.id, depth + 1)
    }
  }
  visit(null, 0)
  return out
}
