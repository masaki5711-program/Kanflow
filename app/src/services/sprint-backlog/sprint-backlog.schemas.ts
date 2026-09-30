import { z } from "zod"
import { versionField } from "@/services/_shared/versioning"
import { MAX_TASK_ASSIGNEES } from "./task-assignees"

export const TASK_STATUSES = ["todo", "in_progress", "review", "done"] as const

export const addSprintPbisSchema = z.object({
  pbIds: z.array(z.string().min(1)).min(1).max(50),
})

export const removeSprintPbiSchema = z.object({
  pbItemId: z.string().min(1),
})

/** Normalized assignees (project members' user ids). Wins over the legacy `assignee` string. */
const assigneeIdsField = z.array(z.string().min(1).max(64)).max(MAX_TASK_ASSIGNEES).optional()

export const createTaskSchema = z.object({
  pbItemId: z.string().min(1),
  taskName: z.string().max(500).optional(),
  /** Legacy display-name string (still accepted; resolved against the members). */
  assignee: z.string().max(200).nullable().optional(),
  assigneeIds: assigneeIdsField,
  estimatedHours: z.number().nullable().optional(),
})

export const updateTaskSchema = z.object({
  taskName: z.string().max(500).optional(),
  assignee: z.string().max(200).nullable().optional(),
  estimatedHours: z.number().nullable().optional(),
  actualHours: z.number().nullable().optional(),
  status: z.enum(TASK_STATUSES).optional(),
  completionComment: z.string().max(5000).nullable().optional(),
  assigneeIds: assigneeIdsField,
  /** Optimistic lock: the version the client loaded (omitted = unchecked, legacy). */
  version: versionField,
})

export type CreateTaskInput = z.infer<typeof createTaskSchema>
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>
