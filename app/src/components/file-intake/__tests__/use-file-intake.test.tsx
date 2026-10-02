import { describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"
import type { ClipboardEvent, DragEvent } from "react"
import { namePastedFile, useFileIntake } from "../use-file-intake"

describe("namePastedFile", () => {
  const now = new Date(2026, 2, 5, 9, 7, 3) // 2026-03-05 09:07:03 local

  it("renames a pasted 'image.png' to a timestamped screenshot name", () => {
    const file = new File(["x"], "image.png", { type: "image/png" })
    const renamed = namePastedFile(file, now)
    expect(renamed.name).toBe("screenshot-20260305-090703.png")
    expect(renamed.type).toBe("image/png")
  })

  it.each(["image.jpg", "image.jpeg", "image.gif", "image.webp"])(
    "renames %s (any of the common screenshot extensions)",
    (name) => {
      const ext = name.split(".").pop()!
      const file = new File(["x"], name, { type: "image/png" })
      expect(namePastedFile(file, now).name).toBe(`screenshot-20260305-090703.${ext}`)
    },
  )

  it("matches the screenshot extension case-insensitively, keeping the original extension case", () => {
    const file = new File(["x"], "IMAGE.PNG", { type: "image/png" })
    expect(namePastedFile(file, now).name).toBe("screenshot-20260305-090703.PNG")
  })

  it("leaves a normally-named file alone", () => {
    const file = new File(["x"], "diagram.png", { type: "image/png" })
    expect(namePastedFile(file, now)).toBe(file)
  })

  it("leaves a non-image file named 'image.pdf' alone (extension not in the screenshot set)", () => {
    const file = new File(["x"], "image.pdf", { type: "application/pdf" })
    expect(namePastedFile(file, now)).toBe(file)
  })

  it("pads single-digit month/day/hour/minute/second", () => {
    const early = new Date(2026, 0, 2, 3, 4, 5) // 2026-01-02 03:04:05
    const file = new File(["x"], "image.png", { type: "image/png" })
    expect(namePastedFile(file, early).name).toBe("screenshot-20260102-030405.png")
  })
})

function dragEvent(types: string[], files: File[] = []): DragEvent {
  return {
    preventDefault: vi.fn(),
    dataTransfer: { types, files, dropEffect: "none" },
  } as unknown as DragEvent
}

function pasteEvent(files: File[]): ClipboardEvent {
  return {
    preventDefault: vi.fn(),
    clipboardData: { files },
  } as unknown as ClipboardEvent
}

describe("useFileIntake", () => {
  it("tracks drag-enter/leave depth and exposes dragActive only while files hover", () => {
    const onFiles = vi.fn()
    const { result } = renderHook(() => useFileIntake(onFiles))
    const enter = dragEvent(["Files"])
    act(() => result.current.dropProps.onDragEnter(enter))
    expect(result.current.dragActive).toBe(true)
    expect(enter.preventDefault).toHaveBeenCalled()

    // A nested dragenter (e.g. child element) increases depth; one leave does not clear it.
    act(() => result.current.dropProps.onDragEnter(dragEvent(["Files"])))
    act(() => result.current.dropProps.onDragLeave(dragEvent(["Files"])))
    expect(result.current.dragActive).toBe(true)
    act(() => result.current.dropProps.onDragLeave(dragEvent(["Files"])))
    expect(result.current.dragActive).toBe(false)
  })

  it("ignores drag events that are not carrying files", () => {
    const onFiles = vi.fn()
    const { result } = renderHook(() => useFileIntake(onFiles))
    const enter = dragEvent(["text/plain"])
    act(() => result.current.dropProps.onDragEnter(enter))
    expect(result.current.dragActive).toBe(false)
    expect(enter.preventDefault).not.toHaveBeenCalled()
  })

  it("sets copy dropEffect on dragover", () => {
    const { result } = renderHook(() => useFileIntake(vi.fn()))
    const e = dragEvent(["Files"])
    act(() => result.current.dropProps.onDragOver(e))
    expect((e.dataTransfer as DataTransfer).dropEffect).toBe("copy")
  })

  it("drop resets depth/active and forwards the dropped files", () => {
    const onFiles = vi.fn()
    const { result } = renderHook(() => useFileIntake(onFiles))
    act(() => result.current.dropProps.onDragEnter(dragEvent(["Files"])))
    const file = new File(["a"], "a.txt")
    const drop = dragEvent(["Files"], [file])
    act(() => result.current.dropProps.onDrop(drop))
    expect(drop.preventDefault).toHaveBeenCalled()
    expect(result.current.dragActive).toBe(false)
    expect(onFiles).toHaveBeenCalledWith([file])
  })

  it("drop with no files does not call onFiles", () => {
    const onFiles = vi.fn()
    const { result } = renderHook(() => useFileIntake(onFiles))
    act(() => result.current.dropProps.onDrop(dragEvent(["Files"], [])))
    expect(onFiles).not.toHaveBeenCalled()
  })

  it("disabled: drag/drop handlers are no-ops", () => {
    const onFiles = vi.fn()
    const { result } = renderHook(() => useFileIntake(onFiles, true))
    const enter = dragEvent(["Files"])
    act(() => result.current.dropProps.onDragEnter(enter))
    expect(result.current.dragActive).toBe(false)
    expect(enter.preventDefault).not.toHaveBeenCalled()
    act(() => result.current.dropProps.onDrop(dragEvent(["Files"], [new File(["a"], "a.txt")])))
    expect(onFiles).not.toHaveBeenCalled()
  })

  it("paste forwards clipboard files renamed via namePastedFile, and prevents default", () => {
    const onFiles = vi.fn()
    const { result } = renderHook(() => useFileIntake(onFiles))
    const img = new File(["x"], "image.png", { type: "image/png" })
    const e = pasteEvent([img])
    act(() => result.current.onPaste(e))
    expect(e.preventDefault).toHaveBeenCalled()
    expect(onFiles).toHaveBeenCalledTimes(1)
    const [[passed]] = onFiles.mock.calls
    expect(passed).toHaveLength(1)
    expect(passed[0].name).toMatch(/^screenshot-\d{8}-\d{6}\.png$/)
  })

  it("paste with no clipboard files does nothing (text paste keeps working)", () => {
    const onFiles = vi.fn()
    const { result } = renderHook(() => useFileIntake(onFiles))
    const e = pasteEvent([])
    act(() => result.current.onPaste(e))
    expect(e.preventDefault).not.toHaveBeenCalled()
    expect(onFiles).not.toHaveBeenCalled()
  })

  it("paste is a no-op when disabled", () => {
    const onFiles = vi.fn()
    const { result } = renderHook(() => useFileIntake(onFiles, true))
    const e = pasteEvent([new File(["x"], "a.txt")])
    act(() => result.current.onPaste(e))
    expect(onFiles).not.toHaveBeenCalled()
  })
})
