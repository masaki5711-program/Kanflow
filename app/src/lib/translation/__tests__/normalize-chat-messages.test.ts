import { describe, expect, test } from "vitest"
import { normalizeChatMessages, type ChatMessage } from "@/lib/ollama"

describe("normalizeChatMessages", () => {
  test("folds several leading system messages into one", () => {
    const out = normalizeChatMessages([
      { role: "system", content: "A" },
      { role: "system", content: "B" },
      { role: "user", content: "hi" },
    ])
    expect(out).toEqual([
      { role: "system", content: "A\n\nB" },
      { role: "user", content: "hi" },
    ])
  })

  test("moves a trailing system message to the front", () => {
    const out = normalizeChatMessages([
      { role: "system", content: "A" },
      { role: "user", content: "hi" },
      { role: "system", content: "force" },
    ])
    expect(out[0]).toEqual({ role: "system", content: "A\n\nforce" })
    expect(out.slice(1)).toEqual([{ role: "user", content: "hi" }])
  })

  test("leaves a single leading system message and no-system conversations untouched", () => {
    const single: ChatMessage[] = [{ role: "system", content: "A" }, { role: "user", content: "hi" }]
    expect(normalizeChatMessages(single)).toBe(single)
    const none: ChatMessage[] = [{ role: "user", content: "hi" }]
    expect(normalizeChatMessages(none)).toBe(none)
  })
})
