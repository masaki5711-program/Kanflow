import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const ollamaGenerate = vi.fn()
vi.mock("@/lib/ollama", () => ({
  OLLAMA_BASE_URL: "http://ollama.test",
  OLLAMA_MODELS: { translate: "test-model" },
  ollamaGenerate: (...a: unknown[]) => ollamaGenerate(...a),
}))

const { translateText, numPredictFor, MAX_NUM_PREDICT, ollamaReachable } = await import(
  "@/lib/translation/translator"
)

beforeEach(() => ollamaGenerate.mockReset())
afterEach(() => vi.unstubAllGlobals())

describe("numPredictFor", () => {
  it("scales with input length and caps", () => {
    expect(numPredictFor("abc")).toBe(73)
    expect(numPredictFor("x".repeat(10_000))).toBe(MAX_NUM_PREDICT)
  })
})

describe("translateText", () => {
  it("returns empty for blank input without calling the model", async () => {
    const out = await translateText({ text: "   ", targetLocale: "ja" })
    expect(out).toMatchObject({ translated: "", modelUsed: "(empty)" })
    expect(ollamaGenerate).not.toHaveBeenCalled()
  })

  it("is a no-op when source equals target", async () => {
    const out = await translateText({ text: "こんにちは", targetLocale: "ja" })
    expect(out).toMatchObject({ translated: "こんにちは", sourceLocale: "ja", modelUsed: "(noop)" })
    expect(ollamaGenerate).not.toHaveBeenCalled()
  })

  it("A3-03: never shows @mentions to the model and restores them verbatim", async () => {
    ollamaGenerate.mockResolvedValue("Mohon tinjau {{M0}} dan {{M1}} sebelum perencanaan sprint.")
    const out = await translateText({ text: "@[E2E SM] と @[E2E Dev] スプリント計画前にレビューしてください。", targetLocale: "id" })
    const prompt = ollamaGenerate.mock.calls[0][0] as string
    expect(prompt).not.toContain("E2E SM")
    expect(prompt).toContain("{{M0}}")
    expect(out.translated).toBe("Mohon tinjau @[E2E SM] dan @[E2E Dev] sebelum perencanaan sprint.")
  })

  it("cleans quotes and separators from the model output", async () => {
    ollamaGenerate.mockResolvedValue("----\n「Halo dunia」\n----")
    const out = await translateText({ text: "こんにちは世界", targetLocale: "id" })
    expect(out).toEqual({
      translated: "Halo dunia",
      sourceLocale: "ja",
      targetLocale: "id",
      modelUsed: "test-model",
      glossaryApplied: 0,
      glossaryMisses: [],
    })
    const [prompt, opts] = ollamaGenerate.mock.calls[0]
    expect(prompt).toContain("日本語")
    expect(prompt).toContain("Bahasa Indonesia")
    expect(opts).toMatchObject({ temperature: 0.2, role: "translate", think: false })
  })

  it("retries with the strong instruction and keeps the better output", async () => {
    ollamaGenerate.mockResolvedValueOnce("Perbaikan dilakukan").mockResolvedValueOnce("KAIZEN dilakukan")
    const signal = new AbortController().signal
    const out = await translateText(
      { text: "改善を行う", sourceLocale: "ja", targetLocale: "id", glossary: [{ term: "改善", translation: "KAIZEN" }] },
      { signal, background: true }
    )
    expect(out.translated).toBe("KAIZEN dilakukan")
    expect(out.glossaryApplied).toBe(1)
    expect(out.glossaryMisses).toEqual([])
    expect(ollamaGenerate).toHaveBeenCalledTimes(2)
    const [strongPrompt, strongOpts] = ollamaGenerate.mock.calls[1]
    expect(strongPrompt).toContain("【厳守】")
    expect(strongOpts).toMatchObject({ temperature: 0, signal, background: true })
  })

  it("keeps the first output when the retry is empty", async () => {
    ollamaGenerate.mockResolvedValueOnce("Perbaikan").mockResolvedValueOnce("   ")
    const out = await translateText({
      text: "改善",
      targetLocale: "id",
      glossary: [{ term: "改善", translation: "KAIZEN" }],
    })
    expect(out.translated).toBe("Perbaikan")
    expect(out.glossaryMisses).toEqual(["改善"])
    expect(out.glossaryApplied).toBe(0)
  })

  it("translates ID to JA with the glossary block", async () => {
    ollamaGenerate.mockResolvedValue("会議")
    const out = await translateText({
      text: "rapat",
      targetLocale: "ja",
      glossary: [{ term: "rapat", translation: "会議" }],
    })
    expect(out.sourceLocale).toBe("id")
    expect(out.glossaryApplied).toBe(1)
    expect(ollamaGenerate.mock.calls[0][0]).toContain("rapat → 会議")
  })
})

describe("ollamaReachable", () => {
  it("returns true when the version endpoint responds ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal("fetch", fetchMock)
    expect(await ollamaReachable(100)).toBe(true)
    expect(fetchMock.mock.calls[0][0]).toBe("http://ollama.test/api/version")
  })

  it("returns false on non-ok or network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }))
    expect(await ollamaReachable()).toBe(false)
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")))
    expect(await ollamaReachable()).toBe(false)
  })
})
