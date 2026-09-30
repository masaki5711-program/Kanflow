/**
 * Upper bounds for list queries that used to be unbounded. They are set well
 * above current data sizes so today's UX is unchanged; they only protect the
 * server (memory, response size, 5-connection pool) when a project grows far
 * beyond normal. When a list reaches its cap, the oldest / lowest-priority
 * rows (by the list's ORDER BY) are the ones cut off.
 */
export const LIST_LIMITS = {
  /** PBIs per project (ready + not ready + completed). */
  backlogItems: 2000,
  /** Icebox requests per project (all statuses). */
  iceboxItems: 2000,
  productGoals: 500,
  /** Plan rows per project (matches the plan reorder max). */
  planItems: 2000,
  releaseItems: 2000,
  /** Sprints per project, newest first; each carries its tasks. */
  sprints: 500,
  /** Sprints considered by the burndown chart. */
  burndownSprints: 200,
  dailyScrumNotes: 1000,
  calendarEvents: 2000,
  projectMembers: 1000,
  /** Admin user table. */
  users: 5000,
  sections: 1000,
  adminCategories: 2000,
  userCategories: 500,
  fixedTasks: 500,
  /** Newest AI reports on the dashboard (unchanged). */
  aiReports: 10,
  /** User search typeahead (unchanged). */
  userSearch: 20,
} as const
