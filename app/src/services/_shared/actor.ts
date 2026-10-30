import type { Session } from "next-auth"

/**
 * Who performs a service call. Authorization is decided in the route (via
 * `requireProject` / `requireAuth` / `requireAdmin`); services only need the
 * identity for authorship fields and glossary attribution.
 */
export interface Actor {
  userId: string
  /** Display name stored in author / createdBy / uploadedBy columns. */
  userName: string | null
  /** User.role ("admin" | "section_manager" | "member"). */
  systemRole: string
  /** Set when the call came through a personal access token (REST API / Kanflow MCP); recorded in the activity log. */
  via?: "api"
}

export function actorFromSession(session: Session): Actor {
  return {
    userId: session.user.id,
    userName: session.user.name ?? null,
    systemRole: session.user.role ?? "member",
  }
}
