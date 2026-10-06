import { describe, expect, it } from "vitest"
import { MAX_COMPARE_FILES, MAX_INDEX_FILES, gitBlobSha, planFromCompare, planFromTree, remainingAfter } from "../repo-index-plan"

const diff = (o: Partial<{ old_path: string; new_path: string; new_file: boolean; renamed_file: boolean; deleted_file: boolean }>) => ({
  old_path: o.old_path ?? o.new_path ?? "",
  new_path: o.new_path ?? o.old_path ?? "",
  new_file: o.new_file ?? false,
  renamed_file: o.renamed_file ?? false,
  deleted_file: o.deleted_file ?? false,
})
const isDoc = (p: string) => p.endsWith(".md")

describe("planFromCompare", () => {
  it("re-indexes added / modified files, deletes removed ones and the old side of renames", () => {
    const plan = planFromCompare(
      [
        diff({ new_path: "b.md", new_file: true }),
        diff({ new_path: "a.md" }),
        diff({ old_path: "gone.md", deleted_file: true }),
        diff({ old_path: "old/name.md", new_path: "new/name.md", renamed_file: true }),
      ],
      isDoc,
    )
    expect(plan).toEqual([
      { op: "upsert", path: "a.md" },
      { op: "upsert", path: "b.md" },
      { op: "delete", path: "gone.md" },
      { op: "upsert", path: "new/name.md" },
      { op: "delete", path: "old/name.md" },
    ])
  })

  it("deletes the stored chunks of a file that no longer qualifies (e.g. renamed to an image)", () => {
    expect(planFromCompare([diff({ old_path: "a.md", new_path: "a.png", renamed_file: true })], isDoc)).toEqual([
      { op: "delete", path: "a.md" },
      { op: "delete", path: "a.png" },
    ])
  })

  it("asks for a full pass when the compare is too large", () => {
    expect(planFromCompare(Array.from({ length: MAX_COMPARE_FILES }, (_, i) => diff({ new_path: `f${i}.md` })), isDoc)).toBeNull()
  })
})

describe("planFromTree", () => {
  const tree = [
    { id: "s1", path: "a.md", type: "blob" as const },
    { id: "s2", path: "b.md", type: "blob" as const },
    { id: "t", path: "docs", type: "tree" as const },
    { id: "s3", path: "logo.png", type: "blob" as const },
  ]

  it("indexes every included file on the first pass", () => {
    expect(planFromTree(tree, new Map(), isDoc)).toEqual({ changes: [{ op: "upsert", path: "a.md" }, { op: "upsert", path: "b.md" }], truncated: false })
  })

  it("skips files whose blob id is unchanged and deletes stored files that disappeared or are now excluded", () => {
    const stored = new Map([["a.md", "s1"], ["b.md", "old"], ["removed.md", "x"], ["logo.png", "s3"]])
    expect(planFromTree(tree, stored, isDoc).changes).toEqual([
      { op: "upsert", path: "b.md" },
      { op: "delete", path: "logo.png" },
      { op: "delete", path: "removed.md" },
    ])
  })

  it("caps the number of files and says so", () => {
    const big = Array.from({ length: MAX_INDEX_FILES + 5 }, (_, i) => ({ id: `s${i}`, path: `f${String(i).padStart(5, "0")}.md`, type: "blob" as const }))
    const plan = planFromTree(big, new Map(), isDoc)
    expect(plan.truncated).toBe(true)
    expect(plan.changes).toHaveLength(MAX_INDEX_FILES)
  })
})

describe("remainingAfter", () => {
  const changes = [
    { op: "upsert" as const, path: "a.md" },
    { op: "delete" as const, path: "b.md" },
    { op: "upsert" as const, path: "c.md" },
  ]
  it("resumes after the last finished path of an interrupted pass", () => {
    expect(remainingAfter(changes, "b.md")).toEqual([{ op: "upsert", path: "c.md" }])
    expect(remainingAfter(changes, null)).toEqual(changes)
  })
})

describe("gitBlobSha", () => {
  it("equals git's blob id (git hash-object)", () => {
    // printf 'hello\n' | git hash-object --stdin
    expect(gitBlobSha(Buffer.from("hello\n"))).toBe("ce013625030ba8dba906f756967f9e9ca394464a")
  })
})
