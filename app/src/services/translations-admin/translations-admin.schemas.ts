import { z } from "zod"

/** POST /api/admin/translations/purge-orphans body (optional). */
export const purgeOrphansSchema = z.object({
  /** Count orphans without deleting. Default false. */
  dryRun: z.boolean().optional(),
})

export type PurgeOrphansInput = z.infer<typeof purgeOrphansSchema>
