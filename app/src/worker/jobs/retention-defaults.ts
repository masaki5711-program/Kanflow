/** Retention defaults (pure; imported by the DB-free worker config). */
export const DEFAULT_ACTIVITY_RETENTION_DAYS = 730
export const DEFAULT_NOTIFICATION_RETENTION_DAYS = 90
/** Chat threads idle (last message) longer than this are deleted (CHAT_RETENTION_DAYS). */
export const DEFAULT_CHAT_RETENTION_DAYS = 180
/** Deleted (trashed) chat threads are purged this long after deletion (CHAT_DELETED_RETENTION_DAYS). */
export const DEFAULT_CHAT_DELETED_RETENTION_DAYS = 30
/** Finished AiJob rows (done / failed / cancelled) older than this are deleted (AI_JOB_RETENTION_DAYS). */
export const DEFAULT_AI_JOB_RETENTION_DAYS = 30
