import { describe, expect, it } from "vitest"
import { decideRuleUse, promotionBlock, sameRuleContent, type RuleScopeFacts } from "../scope"

const projectRule: RuleScopeFacts = { state: "confirmed", scope: "project", sourceProjectId: "p1", lineage: null, projectType: null, fromRetrospective: false }
const lineageRule: RuleScopeFacts = { ...projectRule, scope: "shared", lineage: "line-A" }
const target = { projectId: "p1", lineage: "line-A", projectType: "software" }
const other = { projectId: "p2", lineage: "line-A", projectType: "software" }

describe("decideRuleUse", () => {
  it("draft_rule_never_changes_plan", () => {
    expect(decideRuleUse({ ...projectRule, state: "draft" }, target, false)).toEqual({ use: false, reason: "draft" })
    expect(decideRuleUse({ ...lineageRule, state: "draft" }, other, false)).toEqual({ use: false, reason: "draft" })
  })

  it("a retired rule is not used", () => {
    expect(decideRuleUse({ ...projectRule, state: "retired" }, target, false)).toEqual({ use: false, reason: "retired" })
  })

  it("a project rule works only in its source project", () => {
    expect(decideRuleUse(projectRule, target, false)).toEqual({ use: true })
    expect(decideRuleUse(projectRule, other, false)).toEqual({ use: false, reason: "other_project" })
  })

  it("a project rule with a confidential source still works inside its source project", () => {
    expect(decideRuleUse(projectRule, target, true)).toEqual({ use: true })
  })

  it("a shared rule applies where every given filter matches", () => {
    expect(decideRuleUse(lineageRule, other, false)).toEqual({ use: true })
    expect(decideRuleUse(lineageRule, { ...other, lineage: "line-B" }, false)).toEqual({ use: false, reason: "scope_mismatch" })
    expect(decideRuleUse(lineageRule, { ...other, lineage: null }, false)).toEqual({ use: false, reason: "scope_mismatch" })
    const both: RuleScopeFacts = { ...lineageRule, projectType: "general" }
    expect(decideRuleUse(both, other, false)).toEqual({ use: false, reason: "scope_mismatch" })
    expect(decideRuleUse(both, { ...other, projectType: "general" }, false)).toEqual({ use: true })
    const typeOnly: RuleScopeFacts = { ...lineageRule, lineage: null, projectType: "software" }
    expect(decideRuleUse(typeOnly, { ...other, lineage: null }, false)).toEqual({ use: true })
  })

  it("rule_with_newly_confidential_source_stops_outside_project", () => {
    expect(decideRuleUse(lineageRule, other, true)).toEqual({ use: false, reason: "source_confidential" })
    // ... but keeps working in the project it came from.
    expect(decideRuleUse(lineageRule, target, true)).toEqual({ use: true })
  })

  it("a shared rule without any filter is never used outside its source project (fail closed)", () => {
    expect(decideRuleUse({ ...lineageRule, lineage: null, projectType: null }, other, false)).toEqual({ use: false, reason: "scope_mismatch" })
  })

  it("sharing never takes a rule away from its source project, whatever the filters", () => {
    expect(decideRuleUse({ ...lineageRule, lineage: "line-Z" }, target, false)).toEqual({ use: true })
    expect(decideRuleUse({ ...lineageRule, lineage: null, projectType: "general" }, { ...target, lineage: null }, false)).toEqual({ use: true })
    expect(decideRuleUse({ ...lineageRule, state: "retired" }, target, false)).toEqual({ use: false, reason: "retired" })
  })
})

describe("promotionBlock", () => {
  it("allows a confirmed project rule with non-confidential, non-retrospective sources", () => {
    expect(promotionBlock(projectRule, false)).toBeNull()
  })

  it("retro_rule_is_project_scope_only", () => {
    expect(promotionBlock({ ...projectRule, fromRetrospective: true }, false)).toBe("retrospective_source")
  })

  it("refuses a rule whose source is confidential (now)", () => {
    expect(promotionBlock(projectRule, true)).toBe("source_confidential")
  })

  it("refuses drafts, retired rules and rules already shared", () => {
    expect(promotionBlock({ ...projectRule, state: "draft" }, false)).toBe("not_confirmed")
    expect(promotionBlock({ ...projectRule, state: "retired" }, false)).toBe("not_confirmed")
    expect(promotionBlock(lineageRule, false)).toBe("already_shared")
  })
})

describe("sameRuleContent (confirm shows the numbers)", () => {
  it("matches regardless of key order", () => {
    expect(sameRuleContent({ kind: "add_buffer", params: { afterKey: "a", days: 3 } }, { kind: "add_buffer", params: { days: 3, afterKey: "a" } })).toBe(true)
  })

  it("rule_confirm_is_one_at_a_time_with_numbers: a different number or kind does not match", () => {
    expect(sameRuleContent({ kind: "add_buffer", params: { afterKey: "a", days: 3 } }, { kind: "add_buffer", params: { afterKey: "a", days: 4 } })).toBe(false)
    expect(sameRuleContent({ kind: "split", params: { key: "a", parts: 2 } }, { kind: "scale_duration", params: { key: "a", parts: 2 } })).toBe(false)
    expect(sameRuleContent({ kind: "add_buffer", params: { afterKey: "a", days: 3 } }, { kind: "add_buffer", params: { afterKey: "a", days: 3, extra: 1 } })).toBe(false)
    expect(sameRuleContent({ kind: "add_buffer", params: { afterKey: "a", days: 3 } }, { kind: "add_buffer", params: null })).toBe(false)
  })
})
