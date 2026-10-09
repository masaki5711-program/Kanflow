import { describe, expect, it, vi } from "vitest"
import type { ProjectActor } from "@/lib/authz/policy"
import { PROPOSAL_TOOL_NAMES } from "@/lib/chat-proposals"

vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/attachment-extractor", () => ({ extractAttachment: vi.fn() }))

const { ALL_PACK_TOOL_DEFS, PACKS, packGuide, packHandlers, packToolDefs, selectPacks } = await import("@/lib/chat-tool-packs")
const { CHAT_TOOLS } = await import("@/lib/chat-tools")

const user = (content: string) => ({ role: "user", content })
const member: ProjectActor = { userId: "u", systemRole: "member", projectRole: "dev", isSectionManagerOfProject: false }
const admin: ProjectActor = { ...member, systemRole: "admin" }

describe("pack registry", () => {
  it("every pack tool has a handler and all names are unique across core + packs", () => {
    for (const def of ALL_PACK_TOOL_DEFS) expect(typeof packHandlers[def.function.name]).toBe("function")
    const names = [...CHAT_TOOLS, ...ALL_PACK_TOOL_DEFS].map((t) => t.function.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it("keeps proposal tools out of the core set used by the autonomous agent", () => {
    const core = CHAT_TOOLS.map((t) => t.function.name)
    for (const name of PROPOSAL_TOOL_NAMES) expect(core).not.toContain(name)
    expect(core).not.toContain("portfolio_overview")
  })

  it("has a guide line in every language for every pack", () => {
    for (const pack of Object.values(PACKS)) {
      for (const lang of ["ja", "en", "id"] as const) expect(pack.guide[lang].length).toBeGreaterThan(10)
    }
  })

  it("keeps the full tool schema payload within a token budget", () => {
    // ~4 chars per token for ASCII JSON; the full set must stay well below the
    // 12k num_ctx shared with the system prompt and project snapshot.
    const chars = JSON.stringify([...CHAT_TOOLS, ...ALL_PACK_TOOL_DEFS]).length
    expect(chars / 4).toBeLessThan(4500)
  })
})

describe("selectPacks", () => {
  it("offers no optional pack for a plain sprint question", () => {
    expect(selectPacks({ messages: [user("How is the sprint going?")], actor: member })).toEqual([])
  })

  it("picks packs from ja / en / id keywords", () => {
    expect(selectPacks({ messages: [user("次のリリースはいつ？")] })).toEqual(["planning"])
    expect(selectPacks({ messages: [user("Compare the last two sprints")] })).toEqual(["history"])
    expect(selectPacks({ messages: [user("Buat PBI baru untuk login")] })).toEqual(["proposals"])
    expect(selectPacks({ messages: [user("この要望をアイスボックスに追加して")] })).toEqual(["history", "proposals"])
    expect(selectPacks({ messages: [user("テンプレートを一緒に作りたい")] })).toEqual(["schedule"])
    expect(selectPacks({ messages: [user("Tunda jadwal sprint ini")] })).toEqual(["planning", "schedule"])
    expect(selectPacks({ messages: [user("このPBIをタスクに分割して")] })).toEqual(["proposals"])
  })

  it("keeps a pack for follow-ups within the recent user messages", () => {
    const messages = [user("全体計画の遅れは？"), { role: "assistant", content: "..." }, user("詳しく")]
    expect(selectPacks({ messages })).toEqual(["planning"])
    const old = [user("全体計画は？"), user("a"), user("b"), user("c")]
    expect(selectPacks({ messages: old })).toEqual([])
  })

  it("offers the portfolio only to admins / section managers", () => {
    const messages = [user("全プロジェクトの状況を教えて")]
    expect(selectPacks({ messages, actor: member })).toEqual([])
    expect(selectPacks({ messages })).toEqual([])
    expect(selectPacks({ messages, actor: admin })).toEqual(["portfolio"])
    expect(selectPacks({ messages, actor: { ...member, systemRole: "section_manager" } })).toEqual(["portfolio"])
  })

  it("builds tool defs and guide text for the selection", () => {
    expect(packToolDefs(["planning"]).map((t) => t.function.name)).toEqual([
      "get_plan_progress", "get_release_status", "get_goal_progress", "get_calendar",
    ])
    expect(packGuide([], "ja")).toBe("")
    expect(packGuide(["proposals"], "en")).toContain("propose_pbi")
  })
})
