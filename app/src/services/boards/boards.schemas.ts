import { z } from "zod"
import { BOARD_LIMITS, ELEMENT_ID_PATTERN } from "@/lib/board/limits"
import { elementDataProblem, type ElementWrite } from "@/lib/board/model"

/**
 * Request schemas of the ボード API (docs/plan/10-board.md). Every size is bounded here
 * (src/lib/board/limits.ts); the element body is checked by its type's schema, and a type this build does
 * not know is accepted by shape and size only, so a newer client's elements are stored untouched.
 */

const title = z.string().trim().min(1).max(BOARD_LIMITS.titleLength)
const sheetName = z.string().trim().min(1).max(BOARD_LIMITS.sheetNameLength)

export const createBoardSchema = z.object({
  title,
  /** Name of the first sheet (the client sends it in the user's language). */
  sheetName: sheetName.optional(),
})
export type CreateBoardInput = z.infer<typeof createBoardSchema>

export const updateBoardSchema = z.object({ title })
export type UpdateBoardInput = z.infer<typeof updateBoardSchema>

export const sheetNameSchema = z.object({ name: sheetName })
export type SheetNameInput = z.infer<typeof sheetNameSchema>

export const reorderSheetsSchema = z.object({
  /** Every sheet of the board, in the new order. */
  sheetIds: z.array(z.string().min(1).max(40)).min(1).max(BOARD_LIMITS.sheetsPerBoard),
})
export type ReorderSheetsInput = z.infer<typeof reorderSheetsSchema>

const elementId = z.string().regex(ELEMENT_ID_PATTERN)
const version = z.number().int().min(1).max(BOARD_LIMITS.counter)

const deletedWrite = z.object({ id: elementId, version, deleted: z.literal(true) })

const liveWrite = z
  .object({
    id: elementId,
    version,
    deleted: z.literal(false).optional(),
    data: z.record(z.string(), z.unknown()),
  })
  .superRefine((value, ctx) => {
    const problem = elementDataProblem(value.data)
    if (problem) ctx.addIssue({ code: "custom", path: ["data"], message: problem })
  })

export const writeElementsSchema = z
  .object({
    elements: z.array(z.union([deletedWrite, liveWrite])).min(1).max(BOARD_LIMITS.elementsPerWrite),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>()
    value.elements.forEach((el, index) => {
      if (seen.has(el.id)) ctx.addIssue({ code: "custom", path: ["elements", index, "id"], message: "duplicate element id" })
      seen.add(el.id)
    })
  })

export interface WriteElementsInput {
  elements: ElementWrite[]
}

/** `?since=<rev>` of the elements read: a sheet revision the client already has. */
export const sinceSchema = z
  .string()
  .regex(/^\d{1,10}$/)
  .transform(Number)
  .pipe(z.number().int().min(0).max(BOARD_LIMITS.counter))
