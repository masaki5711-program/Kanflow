import { describe, expect, it } from "vitest"
import { decodeChatStream, encodeChatEvent, statusOf, stripToolHints } from "../chat-proposals"
import { composingStatusLabel, toolStatusLabel } from "../chat-tool-status"

describe("toolStatusLabel", () => {
  it("names the search query and the file being read", () => {
    expect(toolStatusLabel("search_repository_docs", { query: "Rust 以外" }, "ja")).toBe("リポジトリのドキュメントを検索中：「Rust 以外」")
    expect(toolStatusLabel("read_repository_file", { path: "docs/a.md" }, "en")).toBe("Reading file: docs/a.md")
  })

  it("omits the detail when the argument is missing and cuts a long one", () => {
    expect(toolStatusLabel("read_repository_file", null, "id")).toBe("Membaca berkas")
    const long = toolStatusLabel("search_repository_docs", { query: "x".repeat(200) }, "en")
    expect(long.length).toBeLessThan(100)
    expect(long).toContain("…")
  })

  it("falls back to a generic line for other tools and has a composing line", () => {
    expect(toolStatusLabel("list_sprints", {}, "en")).toBe("Fetching information (list_sprints)")
    expect(composingStatusLabel("ja")).toContain("回答")
  })
})

describe("status frames", () => {
  it("decode as events, stay out of the text, and the last one wins", () => {
    const raw = `${encodeChatEvent({ type: "status", text: "A" })}${encodeChatEvent({ type: "status", text: "B" })}answer`
    const { text, events } = decodeChatStream(raw)
    expect(text).toBe("answer")
    expect(statusOf(events)).toBe("B")
  })

  it("an empty status clears the line", () => {
    const raw = `${encodeChatEvent({ type: "status", text: "A" })}${encodeChatEvent({ type: "status", text: "" })}`
    expect(statusOf(decodeChatStream(raw).events)).toBe("")
  })
})

describe("stripToolHints", () => {
  it("removes legacy hint lines, including the model's own run-on imitation", () => {
    expect(stripToolHints("前置き\n\n_🔧 get_work_item_details_\n\n本文")).toBe("前置き\n\n本文")
    expect(stripToolHints("_🔧 read_repository_file_ _🔧 read_repository_file_ _🔧 search_repository_docs_")).toBe("")
  })

  it("leaves ordinary text untouched", () => {
    expect(stripToolHints("普通の回答 🔧 工具")).toBe("普通の回答 🔧 工具")
  })

  it("is applied when decoding stored text", () => {
    expect(decodeChatStream("_🔧 a_\n\n答え").text).toBe("答え")
  })
})
