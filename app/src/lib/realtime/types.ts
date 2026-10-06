/**
 * Real-time update events (shared by the server bus, the SSE route and the
 * browser). An event only says WHAT changed — ids and kinds, never bodies,
 * names or other content — so a client that receives it refetches through
 * the normal, authorized API routes.
 */
export const REALTIME_EVENT_TYPES = ["activity", "comment", "team-message", "notification", "git"] as const
export type RealtimeEventType = (typeof REALTIME_EVENT_TYPES)[number]

export interface RealtimeEvent {
  type: RealtimeEventType
  /** Project the change belongs to (project-scoped events reach the viewers of that project). */
  projectId?: string
  /** Server only: when set, ONLY these users receive the event (never sent to the browser). */
  userIds?: readonly string[]
  /** e.g. "pbi", "sprint_task", "team_message". Absent on a collapsed bulk event. */
  entityType?: string
  /** Absent on a collapsed bulk event (= "any entity of this type"). */
  entityId?: string
  /** Secondary id, e.g. the comment id of a "comment" event on a PBI. */
  subjectId?: string
  /** create / update / delete / status_change / ... */
  action?: string
  /** Acting user (absent for the system), so a client can tell "someone else" apart. */
  actorId?: string
  /** ISO time the event was published. */
  at: string
}

/** What a browser receives: the event minus the recipient list. */
export type RealtimeWireEvent = Omit<RealtimeEvent, "userIds">

/** Event without the publish time (filled in by the bus). */
export type RealtimeEventInput = Omit<RealtimeEvent, "at">

/** SSE event name of the greeting (data: `{ projectId }` actually subscribed, or null). */
export const REALTIME_READY_EVENT = "ready"
/** Endpoint of the stream (`?projectId=` optional). */
export const REALTIME_URL = "/api/realtime"
