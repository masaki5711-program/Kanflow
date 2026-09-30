import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/attachment-extractor", () => ({ extractAttachment: vi.fn() }))
import { CHAT_TOOLS } from "@/lib/chat-tools"
import { PACKS, packToolDefs, type PackName } from "@/lib/chat-tool-packs"

describe("chat tool names", () => {
  it("are unique across the core set and every optional pack", () => {
    // Arrange
    const packs = Object.keys(PACKS) as PackName[]
    const names = [...CHAT_TOOLS, ...packToolDefs(packs)].map((t) => t.function.name)

    // Act
    const duplicates = names.filter((name, i) => names.indexOf(name) !== i)

    // Assert — runTool resolves by name, so a duplicate would silently shadow a handler.
    expect(duplicates).toEqual([])
  })
})
