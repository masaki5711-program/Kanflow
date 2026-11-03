/** Request bodies of the 稼働量 routes (plan 12 E4). No free-text field exists — by design (plan 12 §4). */
import { z } from "zod"
import { dateFromKey } from "@/lib/plan-progress"

/** A real calendar day "YYYY-MM-DD" (2026-02-30 is refused). */
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD").refine((k) => dateFromKey(k) !== null, "not a calendar day")
const fte = z.number().finite().min(0).max(1)

const period = { from: ymd, to: ymd.nullable().optional(), fte }

export const capacityCreateSchema = z.object(period).strict().refine((b) => !b.to || b.to >= b.from, { message: "to must not be before from", path: ["to"] })
export const allocationCreateSchema = z
  .object({ userId: z.string().min(1).max(191), ...period })
  .strict()
  .refine((b) => !b.to || b.to >= b.from, { message: "to must not be before from", path: ["to"] })
export const capacityUpdateSchema = z
  .object({ ...period, version: z.number().int().min(0) })
  .strict()
  .refine((b) => !b.to || b.to >= b.from, { message: "to must not be before from", path: ["to"] })
export const versionSchema = z.object({ version: z.number().int().min(0) }).strict()

export type CapacityCreateInput = z.infer<typeof capacityCreateSchema>
export type AllocationCreateInput = z.infer<typeof allocationCreateSchema>
export type CapacityUpdateInput = z.infer<typeof capacityUpdateSchema>

/** Levelling request: who may hold each role (project members only), and from when. */
export const levelSchema = z
  .object({
    startDate: ymd,
    skipWeekends: z.boolean().optional(),
    roleAssignments: z
      .record(z.string().regex(/^(?!__)[A-Za-z0-9_-]{1,32}$/), z.array(z.string().min(1).max(191)).max(50))
      .refine((m) => Object.keys(m).length <= 50, "at most 50 roles"),
  })
  .strict()
export type LevelRequest = z.infer<typeof levelSchema>

/** Member-load window (at most 26 weeks). */
export const memberLoadQuerySchema = z
  .object({ from: ymd, to: ymd })
  .refine((q) => q.to >= q.from, { message: "to must not be before from", path: ["to"] })
  .refine((q) => ((dateFromKey(q.to)?.getTime() ?? 0) - (dateFromKey(q.from)?.getTime() ?? 0)) / 86_400_000 <= 182, { message: "at most 26 weeks", path: ["to"] })
