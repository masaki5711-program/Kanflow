import { describe, expect, it } from "vitest"
import {
  buildFolderChildMap,
  flattenFolders,
  formatDateLocal,
  formatFileSize,
  isEditableInBrowser,
  isPreviewable,
  isSelfOrDescendant,
  type Folder,
} from "../types"

const folder = (id: string, parentId: string | null, sortOrder: number): Folder => ({ id, name: id, parentId, sortOrder, attachments: [] })

describe("dashboard types helpers", () => {
  it("classifies previewable and editable mime types", () => {
    expect(isPreviewable("image/png")).toBe(true)
    expect(isPreviewable("video/mp4")).toBe(true)
    expect(isPreviewable("audio/mpeg")).toBe(true)
    expect(isPreviewable("application/pdf")).toBe(false)
    expect(isEditableInBrowser("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe(true)
    expect(isEditableInBrowser("application/vnd.ms-excel")).toBe(true)
    expect(isEditableInBrowser("application/pdf")).toBe(false)
  })

  it("formats dates deterministically in UTC and falls back for invalid input", () => {
    expect(formatDateLocal("2026-01-05T23:30:00Z")).toBe("2026/01/05")
    expect(formatDateLocal("not-a-date-xyz")).toBe("not-a-date")
  })

  it("formats file sizes", () => {
    expect(formatFileSize(512)).toBe("512 B")
    expect(formatFileSize(2048)).toBe("2.0 KB")
    expect(formatFileSize(3 * 1024 * 1024)).toBe("3.0 MB")
  })

  it("builds a sorted child map and flattens depth-first", () => {
    const folders = [folder("b", null, 2), folder("a", null, 1), folder("a2", "a", 1), folder("a1", "a", 0), { id: "u", name: "u", attachments: [] }]
    const map = buildFolderChildMap(folders)
    expect(map.get(null)?.map((f) => f.id)).toEqual(["u", "a", "b"])
    expect(map.get("a")?.map((f) => f.id)).toEqual(["a1", "a2"])
    expect(flattenFolders(folders).map(({ folder: f, depth }) => `${f.id}:${depth}`)).toEqual(["u:0", "a:0", "a1:1", "a2:1", "b:0"])
  })

  it("detects self/descendant relationships and survives cycles", () => {
    const folders = [folder("a", null, 0), folder("b", "a", 0), folder("c", "b", 0)]
    expect(isSelfOrDescendant(folders, "a", "c")).toBe(true)
    expect(isSelfOrDescendant(folders, "a", "a")).toBe(true)
    expect(isSelfOrDescendant(folders, "c", "a")).toBe(false)
    expect(isSelfOrDescendant(folders, "a", null)).toBe(false)
    const cyclic = [folder("x", "y", 0), folder("y", "x", 0)]
    expect(isSelfOrDescendant(cyclic, "z", "x")).toBe(false)
  })
})
