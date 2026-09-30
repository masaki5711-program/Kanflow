import { z } from "zod"
import { USER_REQUESTABLE_KINDS } from "@/lib/ai-jobs/config"

/** POST /api/projects/:id/ai/jobs */
export const createAiJobSchema = z.object({
  kind: z.enum(USER_REQUESTABLE_KINDS),
  lang: z.enum(["ja", "en", "id"]).default("ja"),
})

export const aiJobIdSchema = z.string().min(1).max(191)

export type CreateAiJobInput = z.infer<typeof createAiJobSchema>
