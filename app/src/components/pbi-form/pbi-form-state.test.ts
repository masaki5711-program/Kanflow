import { describe, expect, it } from "vitest"
import {
  EMPTY_PBI_FORM,
  buildPbiCreateBody,
  buildPbiPatch,
  isSamePbiForm,
  parseWorkload,
  toPbiForm,
  type PbiFormSource,
} from "./pbi-form-state"

const ITEM = {
  initiative: "Faster login",
  epic: "Auth",
  userStory: "As a user",
  acceptanceCriteria: null,
  referenceDoc: null,
  workloadScore: 5,
  status: "not_ready",
  notReadyReason: "Needs design",
  poNote: null,
  assignedPo: "Hanako",
  productGoalId: "g1",
  iceboxItem: { id: "i1", displayId: 3, request: "Idea" },
} satisfies PbiFormSource

describe("pbi-form-state", () => {
  it("maps a PBI to the form (nulls → '', number → string, links from the nested rows)", () => {
    const form = toPbiForm(ITEM)
    expect(form).toMatchObject({
      initiative: "Faster login",
      acceptanceCriteria: "",
      workloadScore: "5",
      productGoalId: "g1",
      iceboxItemId: "i1",
      assignedPo: "Hanako",
    })
    expect(toPbiForm({ ...ITEM, productGoalId: undefined, productGoal: { id: "g9", title: "x" } }).productGoalId).toBe("g9")
  })

  it("compares forms field by field", () => {
    const form = toPbiForm(ITEM)
    expect(isSamePbiForm(form, { ...form })).toBe(true)
    expect(isSamePbiForm(form, { ...form, epic: "x" })).toBe(false)
  })

  it("parses the workload input", () => {
    expect(parseWorkload("")).toBe(0)
    expect(parseWorkload(" 8 ")).toBe(8)
    expect(parseWorkload("-3")).toBe(0)
    expect(parseWorkload("abc")).toBe(0)
  })

  it("patches only changed fields; cleared text becomes '' and cleared links null", () => {
    const form = { ...toPbiForm(ITEM), epic: "", poNote: "note", workloadScore: "8", status: "ready" as const, productGoalId: "", iceboxItemId: "" }
    expect(buildPbiPatch(ITEM, form)).toEqual({
      epic: "",
      poNote: "note",
      workloadScore: 8,
      status: "ready",
      productGoalId: null,
      iceboxItemId: null,
    })
    expect(buildPbiPatch(ITEM, toPbiForm(ITEM))).toEqual({})
  })

  it("builds a create body without empty values", () => {
    expect(buildPbiCreateBody(EMPTY_PBI_FORM)).toEqual({ workloadScore: 0, status: "not_ready", productGoalId: null })
    const body = buildPbiCreateBody({ ...EMPTY_PBI_FORM, userStory: "US", iceboxItemId: "i1", productGoalId: "g1", workloadScore: "3" })
    expect(body).toEqual({ userStory: "US", iceboxItemId: "i1", productGoalId: "g1", workloadScore: 3, status: "not_ready" })
  })
})
