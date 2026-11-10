import { describe, expect, it, vi } from "vitest"
import { decidedAbsent, planFromStationCompare, walkTree, GitStationListingSlowError, type ListedDir } from "../gitstation-files"
import { wantsDirectory } from "../repo-index-rules"
import type { StationTreeEntry } from "@/lib/git/gitstation-browse"

/** Pure parts of the GitStation knowledge source (synthetic paths). */

const dir = (complete: boolean, names: Record<string, "tree" | "file" | "other">): ListedDir => ({ complete, names: new Map(Object.entries(names)) })

describe("decidedAbsent", () => {
  const listed = new Map<string, ListedDir>([
    ["", dir(true, { docs: "tree", "README.md": "file", big: "tree" })],
    ["docs", dir(true, { "a.md": "file", sub: "tree" })],
    ["big", dir(false, { "x.md": "file" })],
  ])

  it.each([
    ["a file missing from a completely listed folder", "docs/gone.md", true],
    ["a folder missing from a completely listed parent", "old/a.md", true],
    ["a file that became a folder", "README.md/x", true],
    ["a file still listed", "docs/a.md", false],
    ["a file in a partly listed folder", "big/y.md", false],
    ["a file under a folder never listed", "docs/sub/z.md", false],
    ["a top-level file still there", "README.md", false],
  ])("%s → %s", (_what, path, absent) => {
    expect(decidedAbsent(path, listed)).toBe(absent)
  })

  it("decides nothing without a root listing", () => {
    expect(decidedAbsent("a.md", new Map())).toBe(false)
  })
})

describe("planFromStationCompare", () => {
  const f = (status: "added" | "modified" | "deleted" | "renamed" | "copied" | "type_changed", oldPath: string | null, newPath: string | null) => ({ status, oldPath, newPath })
  const include = (p: string) => p.startsWith("docs/")

  it("maps every status, sorted by path, one change per path", () => {
    expect(
      planFromStationCompare(
        [
          f("modified", "docs/b.md", "docs/b.md"),
          f("added", null, "docs/a.md"),
          f("deleted", "docs/c.md", null),
          f("renamed", "docs/old.md", "docs/new.md"),
          f("renamed", "docs/out.md", "other/out.md"),
          f("copied", "docs/a.md", "docs/copy.md"),
          f("type_changed", "docs/link.md", "docs/link.md"),
        ],
        include,
      ),
    ).toEqual([
      { op: "upsert", path: "docs/a.md" },
      { op: "upsert", path: "docs/b.md" },
      { op: "delete", path: "docs/c.md" },
      { op: "upsert", path: "docs/copy.md" },
      { op: "upsert", path: "docs/link.md" },
      { op: "upsert", path: "docs/new.md" },
      { op: "delete", path: "docs/old.md" },
      { op: "delete", path: "docs/out.md" },
      // Renamed out of the filter: whatever was stored under the new name goes.
      { op: "delete", path: "other/out.md" },
    ])
  })

  it("asks for a listing instead when the compare is too large", () => {
    expect(planFromStationCompare(Array.from({ length: 1000 }, (_, i) => f("added", null, `docs/${i}.md`)), include)).toBeNull()
  })
})

describe("walkTree", () => {
  const entry = (path: string, type: StationTreeEntry["type"]): StationTreeEntry => ({ name: path.split("/").pop() as string, path, type, oid: "b".repeat(40), size: type === "blob" ? 1 : null })
  const TREE: Record<string, StationTreeEntry[]> = {
    "": [entry("README.md", "blob"), entry("docs", "tree"), entry("node_modules", "tree"), entry("lib", "submodule"), entry("link.md", "symlink")],
    docs: [entry("docs/a.md", "blob"), entry("docs/x", "tree")],
    "docs/x": [entry("docs/x/b.md", "blob")],
  }
  const list = vi.fn(async (d: string) => ({ entries: TREE[d] ?? [], truncated: false }))

  it("lists each wanted folder once, keeps only blobs as files", async () => {
    list.mockClear()
    const walk = await walkTree({ list, prefixes: [], maxDirs: 600 })
    expect(list.mock.calls.map((c) => c[0])).toEqual(["", "docs", "docs/x"])
    expect(walk.files.map((f) => f.path)).toEqual(["README.md", "docs/a.md", "docs/x/b.md"])
    expect(walk).toMatchObject({ truncatedLevels: 0, unvisitedDirs: 0 })
    expect(walk.listed.get("")?.names.get("lib")).toBe("other")
  })

  it("stops at the folder bound and counts what it left unvisited", async () => {
    const walk = await walkTree({ list, prefixes: [], maxDirs: 2 })
    expect(walk.unvisitedDirs).toBe(1)
    expect(walk.listed.has("docs/x")).toBe(false)
  })

  it("fails once its deadline has passed (a partial pass that never finishes would hide the problem)", async () => {
    await expect(walkTree({ list, prefixes: [], maxDirs: 600, deadline: Date.now() - 1 })).rejects.toBeInstanceOf(GitStationListingSlowError)
  })
})

describe("wantsDirectory", () => {
  it.each([
    ["", [], true],
    ["docs", [], true],
    ["docs/node_modules", [], false],
    ["Build", [], false],
    ["docs", ["docs/api/"], true],
    ["docs/api", ["docs/api/"], true],
    ["docs/api/v1", ["docs/api/"], true],
    ["docs/other", ["docs/api/"], false],
    ["src", ["docs/"], false],
  ] as const)("%j with %j → %s", (path, prefixes, wanted) => {
    expect(wantsDirectory(path, prefixes)).toBe(wanted)
  })
})
