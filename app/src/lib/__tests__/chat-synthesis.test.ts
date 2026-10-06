import { describe, expect, it } from "vitest"
import { buildSynthesisMessages, collectMaterial } from "@/lib/chat-synthesis"

const tool = (name: string, content: string) => ({ role: "tool" as const, name, content })

describe("chat answer pass", () => {
  it("keeps tool results newest first, drops the per-result footer and respects the budget", () => {
    const conv = [
      { role: "system" as const, content: "snapshot ".repeat(2000) },
      { role: "user" as const, content: "質問" },
      tool("search_repository_docs", "old result"),
      tool("read_repository_file", "new result\n\n---\n(注) 回答は日本語で"),
    ]
    const material = collectMaterial(conv, 1000)
    expect(material.indexOf("new result")).toBeLessThan(material.indexOf("old result"))
    expect(material).not.toContain("(注)")
    expect(material).not.toContain("snapshot")
    expect(collectMaterial([tool("x", "a".repeat(5000))], 1000).length).toBeLessThan(1100)
  })

  it("builds a two-message, tool-free request in the reply language", () => {
    const msgs = buildSynthesisMessages([tool("search_repository_docs", "PFS は中央サーバー")], "PFS と PFE の違いは？", "ja")
    expect(msgs.map((m) => m.role)).toEqual(["system", "user"])
    expect(msgs[0].content).toContain("これ以上ツールは使えません")
    expect(msgs[1].content).toContain("PFS と PFE の違いは？")
    expect(msgs[1].content).toContain("PFS は中央サーバー")
    expect(buildSynthesisMessages([], "q", "en")[1].content).toContain("(no material was collected)")
  })
})
