import { beforeEach, describe, expect, it, vi } from "vitest"

const ollamaChat = vi.fn()
vi.mock("@/lib/ollama", async (orig) => ({
  ...(await orig<typeof import("@/lib/ollama")>()),
  ollamaChat: (...a: unknown[]) => ollamaChat(...a),
}))
vi.mock("@/lib/ai-monitor", () => ({ aiLog: vi.fn(), aiLogTrunc: (s?: string) => s ?? "" }))

const { buildProgressReportMessages, generateProgressReport, PROGRESS_REPORT_TITLE } = await import("@/lib/progress-report")

beforeEach(() => ollamaChat.mockReset())

describe("progress report prompt", () => {
  it("builds a language-locked system prompt and the snapshot as the user turn", () => {
    const [system, user] = buildProgressReportMessages("SNAPSHOT", "id")
    expect(system.role).toBe("system")
    expect(system.content).toContain("Bahasa Indonesia")
    expect(system.content).toContain('"headline": string')
    expect(user).toEqual({ role: "user", content: "SNAPSHOT" })
    expect(PROGRESS_REPORT_TITLE.ja).toContain("進捗レポート")
  })
})

describe("generateProgressReport", () => {
  it("returns a normalized StructuredReport from JSON output", async () => {
    ollamaChat.mockResolvedValue(JSON.stringify({ headline: "H", overview: "O", findings: [{ severity: "critical", title: "T" }] }))
    const signal = new AbortController().signal
    const r = await generateProgressReport(buildProgressReportMessages("C", "ja"), { signal })
    expect(r).toMatchObject({ headline: "H", overview: "O", findings: [{ severity: "critical", title: "T", detail: null }], outlook: null })
    expect(ollamaChat.mock.calls[0][1]).toMatchObject({ format: "json", signal, role: "analysis" })
  })

  it("retries once on output without the required fields, then fails", async () => {
    ollamaChat.mockResolvedValueOnce('{"headline":""}').mockResolvedValueOnce('{"headline":"H","overview":"O"}')
    expect((await generateProgressReport(buildProgressReportMessages("C", "en"))).headline).toBe("H")
    ollamaChat.mockReset().mockResolvedValue("[1,2]")
    await expect(generateProgressReport(buildProgressReportMessages("C", "en"))).rejects.toThrow()
    expect(ollamaChat).toHaveBeenCalledTimes(2)
  })
})
