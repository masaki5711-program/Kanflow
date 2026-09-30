import { z } from "zod"

export const createEventSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  date: z.string(),
  endDate: z.string().optional(),
  color: z.string().max(20).optional(),
  allDay: z.boolean().optional(),
  sprintId: z.string().optional(),
})

export const updateEventSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  date: z.string().optional(),
  endDate: z.string().nullable().optional(),
  color: z.string().max(20).optional(),
  allDay: z.boolean().optional(),
  sprintId: z.string().nullable().optional(),
})

export type CreateEventInput = z.infer<typeof createEventSchema>
export type UpdateEventInput = z.infer<typeof updateEventSchema>
