import { describe, expect, it } from "vitest"
import {
  buildSynthesisMessages,
  capToolResult,
  collectMaterial,
  conversationChars,
  isContextOverflowError,
  wouldOverflowContext,
} from "@/lib/chat-synthesis"
import { OllamaHttpError } from "@/lib/ollama/errors"

describe("context overflow guard", () => {
  it("stops tool turns before the question would be pushed out of num_ctx", () => {
    expect(wouldOverflowContext(8500, 3300, 12288)).toBe(true) // the failing chat: ~11.8k + next result
    expect(wouldOverflowContext(6000, 3000, 12288)).toBe(false)
  })

  it("does nothing without a measurement", () => {
    expect(wouldOverflowContext(0, 99999, 12288)).toBe(false)
  })
})

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

describe("overflow guard without an Ollama measurement", () => {
  it("falls back to the conversation size (1 token per character) when no usage was reported", () => {
    const conversation = [{ role: "system" as const, content: "x".repeat(9000) }, { role: "tool" as const, content: "y".repeat(4000) }]
    expect(conversationChars(conversation)).toBe(13000)
    expect(wouldOverflowContext(conversationChars(conversation), 0, 12288)).toBe(true)
  })
})

describe("capToolResult", () => {
  it("keeps a short result unchanged", () => {
    expect(capToolResult("short", 100)).toBe("short")
  })

  it("cuts a long result and says so, staying within the cap", () => {
    const out = capToolResult("z".repeat(500), 100)
    expect(out.length).toBeLessThanOrEqual(100)
    expect(out).toContain("truncated")
  })
})

describe("isContextOverflowError", () => {
  it("recognises the Ollama 500 caused by a context overflow", () => {
    expect(isContextOverflowError(new OllamaHttpError(500, '{"error":"no user query found in messages"}'))).toBe(true)
  })

  it("ignores other failures", () => {
    expect(isContextOverflowError(new OllamaHttpError(500, "boom"))).toBe(false)
    expect(isContextOverflowError(new Error("no user query found in messages"))).toBe(false)
  })
})
