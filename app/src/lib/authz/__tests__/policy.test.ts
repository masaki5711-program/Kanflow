import { describe, expect, it } from "vitest"
import {
  PROJECT_ACTIONS,
  accessVia,
  can,
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
