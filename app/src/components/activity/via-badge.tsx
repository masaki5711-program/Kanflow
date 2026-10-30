"use client"

import { Bot, KeyRound } from "lucide-react"
import { Badge } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import type { ActivityVia } from "./history-format"

/**
 * Marks a history / feed entry written with an access token: "via MCP (AI)"
 * (Claude Code and other MCP clients) or "via API" (REST /api/v1). The text is
 * the signal; the icon only repeats it. Nothing for UI and system changes.
 */
export function ViaBadge({ via }: { via: ActivityVia | null }) {
  const { t } = useLanguage()
  if (!via) return null
  const mcp = via === "mcp"
  const Icon = mcp ? Bot : KeyRound
  return (
    <Badge tone="info" title={mcp ? t.historyViaMcpHint : t.historyViaApiHint} data-via={via}>
      <Icon aria-hidden="true" className="h-3 w-3" />
      {mcp ? t.historyViaMcp : t.historyViaApi}
    </Badge>
  )
}
