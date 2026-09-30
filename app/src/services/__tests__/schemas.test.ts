import { describe, expect, it } from "vitest"
import { createFolderSchema, moveAttachmentSchema, updateFolderSchema } from "@/services/attachments/attachments.schemas"
import {
  createBacklogItemSchema,
  reorderBacklogSchema,
  updateBacklogItemSchema,
} from "@/services/backlog/backlog.schemas"
import { createAdminCategorySchema, updateAdminCategorySchema } from "@/services/categories/categories.schemas"
import { createDailyScrumSchema, updateDailyScrumSchema } from "@/services/daily-scrums/daily-scrums.schemas"
import { createEventSchema, updateEventSchema } from "@/services/events/events.schemas"
import { createFixedTaskSchema, updateFixedTaskSchema } from "@/services/fixed-tasks/fixed-tasks.schemas"
import {
  createGlossarySchema,
  listGlossarySchema,
  retranslateGlossarySchema,
  updateGlossarySchema,
} from "@/services/glossary/glossary.schemas"
import { createGoalSchema, updateGoalSchema } from "@/services/goals/goals.schemas"
import { createIceboxItemSchema, updateIceboxItemSchema } from "@/services/icebox/icebox.schemas"
import { addMemberSchema, updateMemberSchema } from "@/services/members/members.schemas"
import { createPlanItemSchema, reorderPlanSchema, updatePlanItemSchema } from "@/services/plan/plan.schemas"
import { createProjectSchema, updateProjectSchema } from "@/services/projects/projects.schemas"
import { importReleaseItemsSchema, updateReleaseItemSchema } from "@/services/releases/releases.schemas"
import { createSectionSchema, updateSectionSchema } from "@/services/sections/sections.schemas"
import {
  addSprintPbisSchema,
  createTaskSchema,
  removeSprintPbiSchema,
  updateTaskSchema,
} from "@/services/sprint-backlog/sprint-backlog.schemas"
import { createSprintSchema, updateSprintSchema } from "@/services/sprints/sprints.schemas"
import { purgeOrphansSchema } from "@/services/translations-admin/translations-admin.schemas"
import {
  assignCategorySchema,
  createUserCategorySchema,
  updateUserCategorySchema,
} from "@/services/user-categories/user-categories.schemas"
import {
  changePasswordSchema,
  createUserSchema,
  languageSchema,
  normalizeOptional,
  resetPasswordSchema,
  updateProfileSchema,
  updateUserSchema,
} from "@/services/users/users.schemas"

const s = (n: number) => "x".repeat(n)

interface Schema {
  safeParse(v: unknown): { success: boolean }
}
const ok = (schema: Schema, v: unknown) => expect(schema.safeParse(v).success, JSON.stringify(v).slice(0, 120)).toBe(true)
const bad = (schema: Schema, v: unknown) => expect(schema.safeParse(v).success, JSON.stringify(v).slice(0, 120)).toBe(false)

describe("attachments schemas", () => {
  it("move / folder", () => {
    ok(moveAttachmentSchema, {})
    ok(moveAttachmentSchema, { folderId: null, sortOrder: 3 })
    bad(moveAttachmentSchema, { sortOrder: 1.5 })
    ok(createFolderSchema, { name: s(100) })
    bad(createFolderSchema, { name: "" })
    bad(createFolderSchema, { name: s(101) })
    bad(createFolderSchema, {})
    ok(updateFolderSchema, { parentId: null })
    bad(updateFolderSchema, { name: "" })
  })
})

describe("backlog schemas", () => {
  it("create accepts an empty body and enforces limits / enums", () => {
    ok(createBacklogItemSchema, {})
    ok(createBacklogItemSchema, { status: "ready", workloadScore: 0, productGoalId: null, initiative: s(500) })
    bad(createBacklogItemSchema, { initiative: s(501) })
    bad(createBacklogItemSchema, { acceptanceCriteria: s(5001) })
    bad(createBacklogItemSchema, { referenceDoc: s(10001) })
    bad(createBacklogItemSchema, { workloadScore: -1 })
    bad(createBacklogItemSchema, { workloadScore: 1.5 })
    bad(createBacklogItemSchema, { workloadScore: "3" })
    bad(createBacklogItemSchema, { status: "done" })
    bad(createBacklogItemSchema, { assignedPo: s(201) })
  })
  it("update / reorder", () => {
    ok(updateBacklogItemSchema, { status: "completed", sortOrder: -2, productGoalId: null })
    bad(updateBacklogItemSchema, { status: "x" })
    bad(updateBacklogItemSchema, { workloadScore: -5 })
    ok(reorderBacklogSchema, { orderedIds: ["a"] })
    bad(reorderBacklogSchema, { orderedIds: [] })
    bad(reorderBacklogSchema, { orderedIds: [1] })
  })
})

describe("admin category / section schemas", () => {
  it("categories", () => {
    ok(createAdminCategorySchema, { name: "n", sectionId: null })
    bad(createAdminCategorySchema, { name: "" })
    bad(createAdminCategorySchema, { name: s(101) })
    bad(createAdminCategorySchema, { name: "n", color: s(51) })
    ok(updateAdminCategorySchema, {})
    bad(updateAdminCategorySchema, { sortOrder: 0.1 })
  })
  it("sections", () => {
    ok(createSectionSchema, { name: "n", description: s(500) })
    bad(createSectionSchema, { name: "n", description: s(501) })
    bad(createSectionSchema, {})
    ok(updateSectionSchema, { description: null })
    bad(updateSectionSchema, { name: "" })
  })
})

describe("daily scrum / events / goals / fixed tasks", () => {
  it("daily scrum", () => {
    ok(createDailyScrumSchema, { date: "2026-01-01", content: "c" })
    bad(createDailyScrumSchema, { date: "", content: "c" })
    bad(createDailyScrumSchema, { date: "2026-01-01", content: s(20001) })
    ok(updateDailyScrumSchema, { archived: true })
    bad(updateDailyScrumSchema, { archived: "yes" })
  })
  it("events", () => {
    ok(createEventSchema, { title: "t", date: "2026-01-01", allDay: true })
    bad(createEventSchema, { title: "t" })
    bad(createEventSchema, { title: s(201), date: "d" })
    bad(createEventSchema, { title: "t", date: "d", color: s(21) })
    ok(updateEventSchema, { description: null, endDate: null, sprintId: null })
    bad(updateEventSchema, { title: "" })
  })
  it("goals", () => {
    ok(createGoalSchema, { title: "g" })
    bad(createGoalSchema, { title: "" })
    ok(updateGoalSchema, { description: null })
    bad(updateGoalSchema, { title: "" })
  })
  it("fixed tasks", () => {
    ok(createFixedTaskSchema, { taskName: s(200) })
    bad(createFixedTaskSchema, { taskName: s(201) })
    bad(createFixedTaskSchema, { taskName: "" })
    ok(updateFixedTaskSchema, { sortOrder: 2 })
    bad(updateFixedTaskSchema, { sortOrder: 2.2 })
  })
})

describe("glossary schemas", () => {
  it("list applies defaults and coerces query-string numbers", () => {
    expect(listGlossarySchema.parse({})).toEqual({ limit: 50, offset: 0 })
    expect(listGlossarySchema.parse({ limit: "10", offset: "5", source: "id" })).toEqual({ limit: 10, offset: 5, source: "id" })
    bad(listGlossarySchema, { limit: "0" })
    bad(listGlossarySchema, { limit: "201" })
    bad(listGlossarySchema, { offset: "-1" })
    bad(listGlossarySchema, { source: "en" })
    bad(listGlossarySchema, { q: s(201) })
  })
  it("create / update / retranslate", () => {
    ok(createGlossarySchema, { sourceLocale: "ja", targetLocale: "id", term: "t", translation: "u", note: null })
    bad(createGlossarySchema, { sourceLocale: "en", targetLocale: "id", term: "t", translation: "u" })
    bad(createGlossarySchema, { sourceLocale: "ja", targetLocale: "id", term: "", translation: "u" })
    bad(createGlossarySchema, { sourceLocale: "ja", targetLocale: "id", term: s(256), translation: "u" })
    bad(createGlossarySchema, { sourceLocale: "ja", targetLocale: "id", term: "t", translation: s(501) })
    ok(updateGlossarySchema, {})
    bad(updateGlossarySchema, { note: s(2001) })
    ok(retranslateGlossarySchema, {})
    ok(retranslateGlossarySchema, { ids: Array(500).fill("a") })
    bad(retranslateGlossarySchema, { ids: Array(501).fill("a") })
  })
})

describe("icebox schemas", () => {
  it("create / update", () => {
    ok(createIceboxItemSchema, { request: "r" })
    bad(createIceboxItemSchema, { request: "" })
    bad(createIceboxItemSchema, { request: s(5001) })
    bad(createIceboxItemSchema, {})
    ok(updateIceboxItemSchema, { status: "frozen", background: null, poFlag: null })
    bad(updateIceboxItemSchema, { status: "deleted" })
    bad(updateIceboxItemSchema, { policyDoc: s(10001) })
    bad(updateIceboxItemSchema, { poFlag: s(101) })
    bad(updateIceboxItemSchema, { request: "" })
  })
})

describe("member schemas", () => {
  it("add requires email, userId or a non-empty userIds", () => {
    ok(addMemberSchema, { email: "a@b.co", role: "dev" })
    ok(addMemberSchema, { userId: "u1", role: "po" })
    ok(addMemberSchema, { userIds: ["u1"], role: "sm" })
    bad(addMemberSchema, { role: "dev" })
    bad(addMemberSchema, { userIds: [], role: "dev" })
    bad(addMemberSchema, { userIds: Array(51).fill("u"), role: "dev" })
    bad(addMemberSchema, { email: "not-an-email", role: "dev" })
    bad(addMemberSchema, { userId: "u1", role: "admin" })
    bad(addMemberSchema, { userId: "", role: "dev" })
  })
  it("update", () => {
    ok(updateMemberSchema, { role: "po" })
    bad(updateMemberSchema, {})
  })
})

describe("plan schemas", () => {
  it("create / update", () => {
    ok(createPlanItemSchema, { name: "n", plannedStart: "a", plannedEnd: "b", parentId: null, status: "delayed" })
    bad(createPlanItemSchema, { name: "n", plannedStart: "a" })
    bad(createPlanItemSchema, { name: s(256), plannedStart: "a", plannedEnd: "b" })
    bad(createPlanItemSchema, { name: "n", plannedStart: "a", plannedEnd: "b", color: s(33) })
    ok(updatePlanItemSchema, { actualStart: null, notes: null })
    bad(updatePlanItemSchema, { status: "cancelled" })
    bad(updatePlanItemSchema, { notes: s(10001) })
  })
  it("reorder is bounded 1..2000", () => {
    ok(reorderPlanSchema, { updates: [{ id: "a", parentId: null, sortOrder: 0 }] })
    bad(reorderPlanSchema, { updates: [] })
    bad(reorderPlanSchema, { updates: Array(2001).fill({ id: "a", parentId: null, sortOrder: 0 }) })
    bad(reorderPlanSchema, { updates: [{ id: "a", sortOrder: 0 }] })
  })
})

describe("project schemas", () => {
  it("create", () => {
    ok(createProjectSchema, { name: "p", projectType: "software", sectionIds: [] })
    bad(createProjectSchema, { name: "" })
    bad(createProjectSchema, { name: s(201) })
    bad(createProjectSchema, { name: "p", projectType: "hardware" })
    bad(createProjectSchema, { name: "p", description: s(5001) })
  })
  it("update bounds", () => {
    ok(updateProjectSchema, { progressPct: 0, sprintDurationDays: 56, cardColor: null, language: "id" })
    ok(updateProjectSchema, { progressPct: 100, sprintDurationDays: 1 })
    bad(updateProjectSchema, { progressPct: 101 })
    bad(updateProjectSchema, { progressPct: -1 })
    bad(updateProjectSchema, { sprintDurationDays: 0 })
    bad(updateProjectSchema, { sprintDurationDays: 57 })
    bad(updateProjectSchema, { defaultCapacity: -1 })
    bad(updateProjectSchema, { status: "deleted" })
    bad(updateProjectSchema, { cardColor: "black" })
    bad(updateProjectSchema, { language: "fr" })
    bad(updateProjectSchema, { pointUnit: "" })
    bad(updateProjectSchema, { pointDescription: s(201) })
  })
})

describe("release schemas", () => {
  it("update / import", () => {
    ok(updateReleaseItemSchema, { status: "released", releaseDate: null, userStory: null })
    bad(updateReleaseItemSchema, { status: "shipped" })
    bad(updateReleaseItemSchema, { manualLink: s(2001) })
    ok(importReleaseItemsSchema, { pbItemIds: ["b1"] })
    bad(importReleaseItemsSchema, { pbItemIds: [] })
    bad(importReleaseItemsSchema, { pbItemIds: ["b1"], planVersion: s(101) })
  })
})

describe("sprint schemas", () => {
  it("sprints", () => {
    ok(createSprintSchema, { sprintName: "s", startDate: "a", endDate: "b", capacity: 0, selectedPbIds: [] })
    bad(createSprintSchema, { sprintName: "s", startDate: "a" })
    bad(createSprintSchema, { sprintName: "", startDate: "a", endDate: "b" })
    bad(createSprintSchema, { sprintName: "s", startDate: "a", endDate: "b", capacity: -1 })
    ok(updateSprintSchema, { status: "archived", retrospectiveTry: null })
    bad(updateSprintSchema, { status: "cancelled" })
    bad(updateSprintSchema, { reviewComment: s(10001) })
  })
  it("sprint backlog", () => {
    ok(addSprintPbisSchema, { pbIds: ["a"] })
    bad(addSprintPbisSchema, { pbIds: [] })
    bad(addSprintPbisSchema, { pbIds: [""] })
    bad(addSprintPbisSchema, { pbIds: Array(51).fill("a") })
    ok(removeSprintPbiSchema, { pbItemId: "a" })
    bad(removeSprintPbiSchema, { pbItemId: "" })
    ok(createTaskSchema, { pbItemId: "a", assignee: null, estimatedHours: null })
    bad(createTaskSchema, { taskName: "t" })
    bad(createTaskSchema, { pbItemId: "a", taskName: s(501) })
    ok(updateTaskSchema, { status: "review", actualHours: 1.5, completionComment: null })
    bad(updateTaskSchema, { status: "blocked" })
    bad(updateTaskSchema, { estimatedHours: "1" })
  })
})

describe("translations-admin / user-categories schemas", () => {
  it("purge orphans", () => {
    ok(purgeOrphansSchema, {})
    ok(purgeOrphansSchema, { dryRun: true })
    bad(purgeOrphansSchema, { dryRun: "true" })
  })
  it("user categories", () => {
    ok(createUserCategorySchema, { name: "n", color: "red" })
    bad(createUserCategorySchema, { name: "n" })
    bad(createUserCategorySchema, { name: s(51), color: "red" })
    bad(createUserCategorySchema, { name: "n", color: s(21) })
    ok(updateUserCategorySchema, { sortOrder: 1 })
    bad(updateUserCategorySchema, { color: "" })
    ok(assignCategorySchema, { projectId: "p1" })
    bad(assignCategorySchema, { projectId: "" })
  })
})

describe("user schemas", () => {
  const base = { name: "n", email: "a@b.co", password: "secret", role: "member" }
  it("create", () => {
    ok(createUserSchema, base)
    ok(createUserSchema, { ...base, employeeNumber: null, department: null, sectionIds: ["s1"] })
    bad(createUserSchema, { ...base, password: "12345" })
    bad(createUserSchema, { ...base, password: s(201) })
    bad(createUserSchema, { ...base, email: "bad" })
    bad(createUserSchema, { ...base, role: "superuser" })
    bad(createUserSchema, { ...base, name: "" })
    bad(createUserSchema, { ...base, employeeNumber: s(51) })
  })
  it("update / reset / profile / change / language", () => {
    ok(updateUserSchema, { isActive: false, role: "section_manager" })
    bad(updateUserSchema, { email: "x" })
    ok(resetPasswordSchema, { password: "123456" })
    bad(resetPasswordSchema, { password: "12345" })
    ok(updateProfileSchema, { employeeNumber: null })
    bad(updateProfileSchema, { department: s(101) })
    ok(changePasswordSchema, { currentPassword: "x", newPassword: "abcdef" })
    bad(changePasswordSchema, { currentPassword: "", newPassword: "abcdef" })
    bad(changePasswordSchema, { currentPassword: "x", newPassword: "abc" })
    ok(languageSchema, { language: "en" })
    bad(languageSchema, { language: "fr" })
  })
  it("normalizeOptional", () => {
    expect(normalizeOptional(undefined)).toBeUndefined()
    expect(normalizeOptional(null)).toBeNull()
    expect(normalizeOptional("   ")).toBeNull()
    expect(normalizeOptional("  E1 ")).toBe("E1")
  })
})
