import { describe, expect, it } from "vitest"
import { parseBlob, parseCompare, parseRefs, parseTree } from "../gitstation-browse"

/** The browse answers as GitStation main 059cc34 sends them (synthetic values). */
const C = "a".repeat(40)
const REV = { type: "branch", name: "main", full_name: "refs/heads/main", commit: C }
const ENTRY = { name: "a.md", path: "docs/a.md", type: "blob", mode: "100644", oid: "b".repeat(40), size: 12 }

const invalid = { kind: "invalid_response" }

describe("parseRefs", () => {
  it("reads branches and the default branch; null = empty repository", () => {
    expect(parseRefs({ default_branch: "main", refs: [{ name: "main", full_name: "refs/heads/main", type: "branch", commit: C, target: null }], truncated: false })).toEqual({
      defaultBranch: "main",
      refs: [{ name: "main", fullName: "refs/heads/main", commit: C }],
      truncated: false,
    })
    expect(parseRefs({ default_branch: null, refs: [], truncated: false }).defaultBranch).toBeNull()
  })

  it.each([
    ["no refs", { default_branch: "main", truncated: false }],
    ["default branch of the wrong type", { default_branch: 3, refs: [], truncated: false }],
    ["an empty default branch", { default_branch: "", refs: [], truncated: false }],
    ["a ref without a name", { default_branch: "main", refs: [{ commit: C }], truncated: false }],
    ["a bad commit id", { default_branch: "main", refs: [{ name: "main", commit: "xyz" }], truncated: false }],
    ["no truncated flag", { default_branch: "main", refs: [] }],
  ])("refuses %s", (_what, body) => {
    expect(() => parseRefs(body)).toThrowError(expect.objectContaining(invalid))
  })
})

describe("parseTree", () => {
  it("reads one level with object ids and sizes", () => {
    const tree = parseTree({ ref: REV, path: "docs", oid: C, entries: [ENTRY, { ...ENTRY, name: "sub", path: "docs/sub", type: "tree", mode: "040000", size: null }], truncated: true })
    expect(tree).toEqual({
      ref: { type: "branch", name: "main", commit: C },
      entries: [
        { name: "a.md", path: "docs/a.md", type: "blob", oid: "b".repeat(40), size: 12 },
        { name: "sub", path: "docs/sub", type: "tree", oid: "b".repeat(40), size: null },
      ],
      truncated: true,
    })
  })

  it.each([
    ["an entry without a path (dropping it would delete that file's passages)", { ...ENTRY, path: undefined }],
    ["an unknown entry type", { ...ENTRY, type: "lfs" }],
    ["a bad object id", { ...ENTRY, oid: "nope" }],
    ["a negative size", { ...ENTRY, size: -1 }],
  ])("fails the whole answer on %s", (_what, entry) => {
    expect(() => parseTree({ ref: REV, entries: [ENTRY, entry], truncated: false })).toThrowError(expect.objectContaining(invalid))
  })

  it("refuses an answer that does not say which commit it is of", () => {
    expect(() => parseTree({ ref: { ...REV, commit: null }, entries: [], truncated: false })).toThrowError(expect.objectContaining(invalid))
  })
})

describe("parseBlob", () => {
  const BLOB = { ref: REV, path: "docs/a.md", name: "a.md", type: "blob", mode: "100644", oid: "b".repeat(40), size: 4, binary: false, content: "# A\n", truncated: false }

  it("reads text, binary (no content) and symlinks", () => {
    expect(parseBlob(BLOB)).toEqual({ ref: { type: "branch", name: "main", commit: C }, type: "blob", oid: "b".repeat(40), size: 4, binary: false, content: "# A\n", truncated: false })
    expect(parseBlob({ ...BLOB, binary: true, content: null }).content).toBeNull()
    expect(parseBlob({ ...BLOB, type: "symlink" }).type).toBe("symlink")
  })

  it.each([
    ["a tree", { type: "tree" }],
    ["content of the wrong type", { content: 3 }],
    ["no binary flag", { binary: undefined }],
    ["a fractional size", { size: 1.5 }],
  ])("refuses %s", (_what, over) => {
    expect(() => parseBlob({ ...BLOB, ...over })).toThrowError(expect.objectContaining(invalid))
  })
})

describe("parseCompare", () => {
  const file = (status: string, oldPath: string | null, newPath: string | null) => ({ status, old_path: oldPath, new_path: newPath, old_mode: null, new_mode: null, binary: false, patch: null, omitted: null })
  const body = (files: unknown[], diff: Record<string, unknown> = {}) => ({ from: { ...REV, type: "commit" }, to: REV, commits: [], commits_truncated: false, diff: { files, truncated: false, ...diff } })

  it("reads every status, and whether documents were withheld", () => {
    const statuses = ["added", "modified", "deleted", "renamed", "copied", "type_changed"]
    const cmp = parseCompare(body(statuses.map((s) => file(s, s === "added" ? null : "o.md", s === "deleted" ? null : "n.md"))))
    expect(cmp.files.map((f) => f.status)).toEqual(statuses)
    expect(cmp.files[0]).toEqual({ status: "added", oldPath: null, newPath: "n.md" })
    expect(cmp).toMatchObject({ truncated: false, withheld: false, to: { commit: C } })
    expect(parseCompare(body([], { withheld: { error_code: "FG-AUTH-0021", documents: 1, requirements: 0, work_items: 0, files: 1 } })).withheld).toBe(true)
  })

  it.each([
    ["an unknown status", [file("moved", "a", "b")]],
    ["a file with neither path", [file("modified", null, null)]],
    ["an empty path", [file("modified", "", "b")]],
  ])("refuses %s", (_what, files) => {
    expect(() => parseCompare(body(files))).toThrowError(expect.objectContaining(invalid))
  })
})
