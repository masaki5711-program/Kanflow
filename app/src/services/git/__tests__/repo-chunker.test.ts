import { describe, expect, it } from "vitest"
import { CHUNK_OVERLAP, CHUNK_SIZE, MAX_CHUNKS_PER_FILE, chunkFile, gitlabSlug, splitWindows } from "../repo-chunker"

describe("gitlabSlug", () => {
  it("follows GitLab's heading anchors: lower-case, punctuation dropped, spaces to hyphens", () => {
    const seen = new Map<string, number>()
    expect(gitlabSlug("2.3 定義", seen)).toBe("23-定義")
    expect(gitlabSlug("OEE / OLE Calculation: Tables", seen)).toBe("oee-ole-calculation-tables")
    expect(gitlabSlug("4_Pemetaan_PFS_dari_PFE", seen)).toBe("4_pemetaan_pfs_dari_pfe")
  })

  it("numbers repeated headings like GitLab (-1, -2)", () => {
    const seen = new Map<string, number>()
    expect([gitlabSlug("Notes", seen), gitlabSlug("Notes", seen), gitlabSlug("Notes", seen)]).toEqual(["notes", "notes-1", "notes-2"])
  })
})

describe("chunkFile — Markdown", () => {
  const md = [
    "# 06 OEE/OLE 計算",
    "概要の本文。",
    "## 2 計算式",
    "### 2.3 定義",
    "OEE は時間稼働率 × 性能稼働率 × 良品率。",
    "```sql",
    "# not a heading inside code",
    "SELECT 1;",
    "```",
    "## 3 _Data_ flow",
    "PFE → PFS.",
  ].join("\n")

  it("makes one chunk per section with the heading path and anchor", () => {
    const chunks = chunkFile("docs/06-oee.md", md)
    expect(chunks.map((c) => c.heading)).toEqual(["06 OEE/OLE 計算", "06 OEE/OLE 計算 > 2 計算式 > 2.3 定義", "06 OEE/OLE 計算 > 3 Data flow"])
    expect(chunks[1].anchor).toBe("23-定義")
    expect(chunks[2].anchor).toBe("3-data-flow")
  })

  it("ignores headings inside fenced code and keeps the code in its section", () => {
    const chunks = chunkFile("a.md", md)
    expect(chunks[1].content).toContain("# not a heading inside code")
    expect(chunks.some((c) => c.heading?.includes("not a heading"))).toBe(false)
  })

  it("drops a heading that has no text of its own (its title lives on in the children)", () => {
    const chunks = chunkFile("a.md", md)
    expect(chunks.find((c) => c.heading === "06 OEE/OLE 計算 > 2 計算式")).toBeUndefined()
  })

  it("keeps text before the first heading as a chunk without heading", () => {
    expect(chunkFile("a.md", "Intro line\n# Title\nBody")[0]).toEqual({ heading: null, anchor: null, content: "Intro line" })
  })

  it("splits a long section into windows that keep the heading and mark continuations", () => {
    const body = Array.from({ length: 120 }, (_, i) => `Line ${i} of a long specification paragraph.`).join("\n")
    const chunks = chunkFile("a.md", `# Big\n${body}`)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every((c) => c.heading === "Big" && c.anchor === "big")).toBe(true)
    expect(chunks[1].content.startsWith("Big（続き）\n")).toBe(true)
  })
})

describe("chunkFile — text, code and extracted documents", () => {
  it("uses ~2,000-character windows with GitLab line anchors", () => {
    const text = Array.from({ length: 300 }, (_, i) => `const value${i} = ${i} // some code`).join("\n")
    const chunks = chunkFile("src/a.ts", text)
    expect(chunks.length).toBeGreaterThan(2)
    expect(chunks[0].anchor).toBe("L1")
    expect(chunks.every((c) => c.content.length <= CHUNK_SIZE && c.heading === null)).toBe(true)
    // The second window starts a little before the first one ended (overlap) at a line start.
    const secondLine = Number(chunks[1].anchor?.slice(1))
    expect(chunks[0].content).toContain(`value${secondLine - 1} =`)
  })

  it("has no line anchors for extracted Office / PDF text", () => {
    expect(chunkFile("documents/spec.docx", "Heading\n\nBody text", false)[0]).toEqual({ heading: null, anchor: null, content: "Heading\n\nBody text" })
  })

  it("treats Markdown-looking extracted text as plain text (no heading parsing)", () => {
    expect(chunkFile("a.md", "# Title\nBody", false)[0].heading).toBeNull()
  })

  it("returns nothing for empty / whitespace files and strips a BOM", () => {
    expect(chunkFile("a.txt", "  \n\n ")).toEqual([])
    expect(chunkFile("a.txt", "﻿hello")[0].content).toBe("hello")
  })
})

describe("splitWindows", () => {
  it("cuts Japanese text without newlines at sentence ends (。) and overlaps neighbours", () => {
    const sentence = "設備の稼働状態を記録し、計画と実績の差を数値化する。"
    const text = sentence.repeat(200)
    const windows = splitWindows(text)
    expect(windows.length).toBeGreaterThan(1)
    expect(windows.every((w) => w.text.length <= CHUNK_SIZE)).toBe(true)
    expect(windows[0].text.endsWith("。")).toBe(true)
    expect(windows[1].start).toBeLessThan(windows[0].start + windows[0].text.length)
    expect(windows[0].start + windows[0].text.length - windows[1].start).toBeLessThanOrEqual(CHUNK_OVERLAP)
  })

  it("never exceeds the per-file cap", () => {
    expect(splitWindows("x".repeat(CHUNK_SIZE * (MAX_CHUNKS_PER_FILE + 50))).length).toBe(MAX_CHUNKS_PER_FILE)
  })

  it("covers the whole text when it fits in one window", () => {
    expect(splitWindows("short text")).toEqual([{ start: 0, text: "short text" }])
  })
})
