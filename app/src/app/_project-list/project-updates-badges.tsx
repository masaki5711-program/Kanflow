"use client"

import Link from "next/link"
import { AtSign, Sparkles } from "lucide-react"
import { cn } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import type { Project } from "./types"

/**
 * "@2" (unread mentions for the viewer) and "新着 5" (other members' updates
 * since the viewer last confirmed the project). Both link to the dashboard,
 * where the "what's new" panel lists them. Nothing is rendered when quiet.
 */
export function ProjectUpdatesBadges({ project, className }: { project: Pick<Project, "id" | "updates">; className?: string }) {
  const { t } = useLanguage()
  const u = project.updates
  if (!u) return null
  const otherUnread = Math.max(0, u.unread - u.mentions)
  const fresh = u.newActivity + otherUnread
  if (u.mentions === 0 && fresh === 0) return null
  const href = `/projects/${project.id}`
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1.5", className)} data-project-updates={project.id}>
      {u.mentions > 0 && (
        <Link
          href={href}
          title={t.updatesCardMentions.replace("{n}", String(u.mentions))}
          aria-label={t.updatesCardMentions.replace("{n}", String(u.mentions))}
          className="relative z-10 inline-flex items-center gap-0.5 rounded-full bg-primary px-2 py-0.5 text-caption font-semibold text-white hover:bg-primary-strong"
        >
          <AtSign aria-hidden="true" className="h-3 w-3" />
          {u.mentions}
        </Link>
      )}
      {fresh > 0 && (
        <Link
          href={href}
          title={t.updatesCardNew.replace("{n}", String(fresh))}
          className="relative z-10 inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-caption font-semibold text-primary-strong ring-1 ring-primary/30 hover:bg-primary/15"
        >
          <Sparkles aria-hidden="true" className="h-3 w-3" />
          {t.updatesCardNew.replace("{n}", fresh > 99 ? "99+" : String(fresh))}
        </Link>
      )}
    </span>
  )
}
