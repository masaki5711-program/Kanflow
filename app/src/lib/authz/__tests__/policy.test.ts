import { describe, expect, it } from "vitest"
import {
  PROJECT_ACTIONS,
  accessVia,
  can,
  canConfirmLineageRule,
  canManageUserCapacity,
  canPseudonymizeActuals,
  type ProjectAction,
  type ProjectActor,
} from "@/lib/authz/policy"

type Persona = "admin" | "po" | "sm" | "dev" | "sectionMgr" | "sectionMgrDev" | "otherSectionMgr" | "outsider"

const ACTORS: Record<Persona, ProjectActor> = {
  admin: { userId: "u", systemRole: "admin", projectRole: null, isSectionManagerOfProject: false },
  po: { userId: "u", systemRole: "member", projectRole: "po", isSectionManagerOfProject: false },
  sm: { userId: "u", systemRole: "member", projectRole: "sm", isSectionManagerOfProject: false },
  dev: { userId: "u", systemRole: "member", projectRole: "dev", isSectionManagerOfProject: false },
  sectionMgr: {
    userId: "u",
    systemRole: "section_manager",
    projectRole: null,
    isSectionManagerOfProject: true,
  },
  sectionMgrDev: {
    userId: "u",
    systemRole: "section_manager",
    projectRole: "dev",
    isSectionManagerOfProject: true,
  },
  otherSectionMgr: {
    userId: "u",
    systemRole: "section_manager",
    projectRole: null,
    isSectionManagerOfProject: false,
  },
  outsider: { userId: "u", systemRole: "member", projectRole: null, isSectionManagerOfProject: false },
}

const ALL: Persona[] = Object.keys(ACTORS) as Persona[]
const MEMBERS: Persona[] = ["admin", "po", "sm", "dev", "sectionMgrDev"]
const PO_SM: Persona[] = ["admin", "po", "sm"]
const PO: Persona[] = ["admin", "po"]
const VIEWERS: Persona[] = [...MEMBERS, "sectionMgr"]

/** Expected matrix — keep in sync with docs/authorization.md. */
const EXPECTED: Record<ProjectAction, Persona[]> = {
  "project.view": VIEWERS,
  "project.updateAppearance": MEMBERS,
  "project.update": PO_SM,
  "project.updateProgress": PO,
  "project.updateSections": PO,
  "project.delete": PO,
  "member.manage": PO_SM,
  "backlog.write": PO_SM,
  "backlog.delete": PO,
  "backlog.reorder": PO,
  "goal.write": PO_SM,
  "plan.write": PO_SM,
  "release.manage": PO,
  "improvement.track": MEMBERS,
  "milestone.track": MEMBERS,
  "sprint.manage": PO_SM,
  "task.write": MEMBERS,
  "dailyScrum.write": MEMBERS,
  "event.write": MEMBERS,
  "attachment.write": MEMBERS,
  "icebox.write": VIEWERS,
  "ai.use": MEMBERS,
  "ai.draftPbi": PO_SM,
  "trash.manage": PO_SM,
  "trash.purge": PO,
  "comment.write": MEMBERS,
  "comment.moderate": PO,
  "surveillance.configure": PO,
  "git.configure": PO_SM,
  "git.sync": MEMBERS,
  "dev.write": MEMBERS,
  "plan.lessonRule.confirm": PO_SM,
  "plan.lessonRule.requestPromotion": PO,
  "plan.actualsFinalize": PO_SM,
  // plan 12 §4: PO / SM and the section manager see members' load (a dev only their own — in the service).
  "plan.viewMemberLoad": ["admin", "po", "sm", "sectionMgr", "sectionMgrDev"],
  "capacity.manage": PO_SM,
  // plan 12 §3.6 / §4: making a plan from actuals is the PO / SM's (a dev, a section manager who only sees the project and a non-member are denied).
  "plan.estimate": PO_SM,
}

const cases = PROJECT_ACTIONS.flatMap((action) =>
  ALL.map((persona) => ({ action, persona, allowed: EXPECTED[action].includes(persona) }))
)

describe("can()", () => {
  it("has an expectation for every action", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...PROJECT_ACTIONS].sort())
  })

  it.each(cases)("$persona → $action = $allowed", ({ action, persona, allowed }) => {
    expect(can(ACTORS[persona], action)).toBe(allowed)
  })

  it("treats an unknown member role as a plain member", () => {
    const actor: ProjectActor = { ...ACTORS.dev, projectRole: "observer" }
    expect(can(actor, "task.write")).toBe(true)
    expect(can(actor, "backlog.write")).toBe(false)
  })

  it("treats an unknown system role as a regular user", () => {
    const actor: ProjectActor = { ...ACTORS.outsider, systemRole: "root" }
    expect(can(actor, "project.view")).toBe(false)
  })
})

describe("accessVia()", () => {
  it.each([
    ["admin", "admin"],
    ["po", "member"],
    ["sectionMgrDev", "member"],
    ["sectionMgr", "section_manager"],
    ["otherSectionMgr", null],
    ["outsider", null],
  ] as const)("%s → %s", (persona, via) => {
    expect(accessVia(ACTORS[persona])).toBe(via)
  })
})

describe("canConfirmLineageRule()", () => {
  // plan 12 §4: shared (lineage / project-type) rules and promotions are confirmed by admins only — not by the PO /
  // SM of the source project, not by a section manager.
  it.each(ALL.map((persona) => ({ persona, allowed: persona === "admin" })))("$persona → $allowed", ({ persona, allowed }) => {
    expect(canConfirmLineageRule(ACTORS[persona])).toBe(allowed)
  })
})

describe("canManageUserCapacity() (user_capacity_allowed_for_self_section_manager_admin_only, po_cannot_set_user_level_capacity)", () => {
  const target = "target"
  it.each([
    ["the person themselves", { userId: target, systemRole: "member" }, false, true],
    ["an admin", { userId: "x", systemRole: "admin" }, false, true],
    ["the section manager of the person's section", { userId: "x", systemRole: "section_manager" }, true, true],
    ["a section manager of another section", { userId: "x", systemRole: "section_manager" }, false, false],
    ["a PO / SM (a member) of the person's project", { userId: "x", systemRole: "member" }, false, false],
    ["a member who shares a section but is no section manager", { userId: "x", systemRole: "member" }, true, false],
  ] as const)("%s → %s", (_label, actor, shares, allowed) => {
    expect(canManageUserCapacity(actor, target, shares)).toBe(allowed)
  })
})

describe("canPseudonymizeActuals()", () => {
  // plan 12 §4 / Q8: pseudonymising actuals owners is admins only (pseudonymize_denied_for_non_admin).
  it.each(ALL.map((persona) => ({ persona, allowed: persona === "admin" })))("$persona → $allowed", ({ persona, allowed }) => {
    expect(canPseudonymizeActuals(ACTORS[persona])).toBe(allowed)
  })
})
