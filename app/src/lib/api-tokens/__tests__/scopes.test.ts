import { describe, expect, it } from "vitest"
import { PROJECT_ACTIONS } from "@/lib/authz/policy"
import {
  API_TOKEN_SCOPES,
  API_TOKEN_SCOPE_PRESETS,
  SCOPE_ACTION,
  isApiTokenScope,
  normalizeScopes,
  scopeForAction,
} from "../scopes"
import { serializeScopes } from "../token"

describe("API token scopes", () => {
  it("maps every scope to a distinct, known project action", () => {
    const actions = API_TOKEN_SCOPES.map((s) => SCOPE_ACTION[s])
    expect(new Set(actions).size).toBe(actions.length)
    for (const a of actions) expect(PROJECT_ACTIONS).toContain(a)
  })

  it("fits every scope into the ApiToken.scopes column (VARCHAR(191))", () => {
    expect(serializeScopes(API_TOKEN_SCOPES).length).toBeLessThanOrEqual(191)
  })

  it("normalizes: read always included, unknown dropped, deduplicated, canonical order", () => {
    expect(normalizeScopes([])).toEqual(["read"])
    expect(normalizeScopes(["comment:write", "admin", "task:write", "comment:write", 3])).toEqual([
      "read",
      "task:write",
      "comment:write",
    ])
  })

  it("finds the scope a project action needs", () => {
    expect(scopeForAction("project.view")).toBe("read")
    expect(scopeForAction("backlog.write")).toBe("backlog:write")
    expect(scopeForAction("sprint.manage")).toBe("sprint:write")
    expect(scopeForAction("dailyScrum.write")).toBe("daily:write")
    expect(scopeForAction("dev.write")).toBe("dev:write")
    expect(scopeForAction("project.delete")).toBeNull()
  })

  it("keeps presets within the known scopes and read-inclusive", () => {
    for (const preset of Object.values(API_TOKEN_SCOPE_PRESETS)) {
      expect(preset).toContain("read")
      for (const s of preset) expect(isApiTokenScope(s)).toBe(true)
    }
    expect(API_TOKEN_SCOPE_PRESETS.developer).not.toContain("backlog:write")
    expect(API_TOKEN_SCOPE_PRESETS.developer).not.toContain("sprint:write")
    // Developers' AI sessions declare work, post progress and link MRs (K5).
    expect(API_TOKEN_SCOPE_PRESETS.developer).toContain("dev:write")
  })

  it("grants dev.write only through dev:write (no other scope opens it)", () => {
    const granting = API_TOKEN_SCOPES.filter((s) => SCOPE_ACTION[s] === "dev.write")
    expect(granting).toEqual(["dev:write"])
  })
})
