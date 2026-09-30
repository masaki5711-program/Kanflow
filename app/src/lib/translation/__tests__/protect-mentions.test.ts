import { describe, expect, it } from "vitest"
import { protectMentions, restoreMentions } from "@/lib/translation/protect-mentions"

describe("protectMentions / restoreMentions", () => {
  it("replaces bracket and bare mentions with numbered placeholders", () => {
    const out = protectMentions("確認お願いします @[E2E SM] と @dev スプリント前に")
    expect(out.tokens).toEqual(["@[E2E SM]", "@dev"])
    expect(out.text).toBe("確認お願いします {{M0}} と {{M1}} スプリント前に")
  })

  it("leaves text without mentions (and e-mail addresses) untouched", () => {
    expect(protectMentions("mail taro@example.com")).toEqual({ text: "mail taro@example.com", tokens: [] })
  })

  it("restores the exact markup, tolerating spaces / full-width braces from the model", () => {
    const tokens = ["@[E2E SM]", "@[Budi Santoso]"]
    expect(restoreMentions("Mohon cek {{ M0 }} dan ｛｛M1｝｝ sebelum sprint", tokens)).toBe(
      "Mohon cek @[E2E SM] dan @[Budi Santoso] sebelum sprint"
    )
  })

  it("appends mentions the model dropped and removes unknown placeholders", () => {
    expect(restoreMentions("Mohon cek {{M1}} {{M7}}", ["@[A]", "@[B]"])).toBe("Mohon cek @[B] @[A]")
  })

  it("round-trips when the model keeps the placeholders", () => {
    const src = "@[田中 太郎] さん、レビューをお願いします。"
    const { text, tokens } = protectMentions(src)
    expect(restoreMentions(text, tokens)).toBe(src)
  })
})
