import { describe, expect, it } from "vitest"
import { defaultEvidenceKind, projectFeatures } from "../project-features"
import { PROJECT_TYPE_VALUES } from "../project-type-labels"
import { PROJECT_TYPES } from "@/services/projects/projects.schemas"

describe("projectFeatures", () => {
  it("shows development features only for software", () => {
    const f = projectFeatures("software")
    expect(f).toMatchObject({ gitPanel: true, workClaimBranch: true, acTestTable: true, outsideScopeWarnings: true, planProminent: false })
  })
  it.each(["equipment", "process_improvement"])("hides development features and promotes the plan for %s", (type) => {
    expect(projectFeatures(type)).toEqual({ gitPanel: false, workClaimBranch: false, acTestTable: false, outsideScopeWarnings: false, planProminent: true })
  })
  it("general: no development features, plan not promoted", () => {
    expect(projectFeatures("general")).toMatchObject({ gitPanel: false, planProminent: false })
  })
  it("unknown / missing falls back to software", () => {
    expect(projectFeatures(undefined).gitPanel).toBe(true)
    expect(projectFeatures("weird").gitPanel).toBe(true)
  })
})

describe("defaultEvidenceKind", () => {
  it("maps project type to evidence kind", () => {
    expect(defaultEvidenceKind("software")).toBe("test")
    expect(defaultEvidenceKind("equipment")).toBe("inspection")
    expect(defaultEvidenceKind("process_improvement")).toBe("measurement")
    expect(defaultEvidenceKind("general")).toBeNull()
  })
})

describe("project type lists", () => {
  it("validation schema and UI list agree and include equipment", () => {
    expect([...PROJECT_TYPES]).toEqual([...PROJECT_TYPE_VALUES])
    expect(PROJECT_TYPES).toContain("equipment")
  })
})
