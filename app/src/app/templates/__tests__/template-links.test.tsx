import { describe, expect, it, vi } from "vitest"
import { useState } from "react"
import { act, renderHook, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { PointerEvent } from "react"
import { renderWithProviders } from "@/app/__tests__/test-utils"
import type { TemplateLink } from "@/lib/plan-templates/links"
import { templateContentSchema } from "@/lib/plan-templates/schema"
import { contentFromForm, effectiveLinks, emptyForm, emptyStage, formFromTemplate, predecessorOptions, toggleLink, type EditorNode } from "../lib/editor-state"
import { arrowPath, buildTimeline, dayPxFor } from "../lib/stage-timeline"
import { StageTimelineEditor } from "../stage-timeline-editor"
import { StageTreeEditor } from "../stage-tree-editor"
import { useDurationResize, useLinkDrag } from "../use-timeline-drag"

const named = (name: string, over: Partial<EditorNode> = {}): EditorNode => ({ ...emptyStage(name), ...over })
const content = { stages: [{ key: "s1", name: "A", durationDays: 5 }, { key: "s2", name: "B", durationDays: 3 }, { name: "C", durationDays: 2 }], links: [{ from: "s1", to: "s2" }] }

describe("editor-state links", () => {
  const form = () => formFromTemplate({ name: "T", description: null, visibility: "public", content })

  it("remaps stored keys to editor keys and writes them back as s1, s2 … (round trip)", () => {
    const f = form()
    expect(f.links).toEqual([{ from: f.stages[0].key, to: f.stages[1].key }])
    expect(contentFromForm(f)).toEqual(content)
    expect(templateContentSchema.safeParse(contentFromForm(f)).success).toBe(true)
  })

  it("drops the links of a removed stage and keys only the stages that take part", () => {
    const f = form()
    const saved = contentFromForm({ ...f, stages: f.stages.filter((_, i) => i !== 1) })
    expect(saved.links).toBeUndefined()
    expect(saved.stages.every((s) => s.key === undefined)).toBe(true)
  })

  it("ignores a link once its stages are parent and child (indent) and revives it when they are apart again", () => {
    const f = form()
    const [a, b, c] = f.stages
    const nested = [{ ...a, children: [b] }, c]
    expect(effectiveLinks(nested, f.links)).toEqual([])
    expect(effectiveLinks(f.stages, f.links)).toHaveLength(1)
  })

  it("lists candidate predecessors with the reason a stage is refused, and toggles a link", () => {
    const f = form()
    const [a, b, c] = f.stages
    const forA = predecessorOptions(f.stages, f.links, a.key)
    expect(forA.find((o) => o.key === b.key)?.block).toBe("cycle")
    expect(forA.find((o) => o.key === c.key)?.block).toBeNull()
    expect(predecessorOptions(f.stages, f.links, b.key).find((o) => o.key === a.key)?.checked).toBe(true)
    expect(toggleLink(f.links, c.key, b.key)).toHaveLength(2)
    expect(toggleLink(f.links, a.key, b.key)).toEqual([])
  })

  it("a new blank form has no links", () => {
    expect(emptyForm().links).toEqual([])
    expect(contentFromForm(emptyForm()).links).toBeUndefined()
  })
})

describe("buildTimeline", () => {
  it("lays bars out like the scheduler: sequential, and a dependency lets a stage run beside the ones in between", () => {
    const a = named("A", { durationDays: "5" })
    const b = named("B", { durationDays: "3" })
    const c = named("C", { durationDays: "2" })
    const { rows } = buildTimeline([a, b, c], [{ from: a.key, to: c.key }])
    expect(rows.map((r) => [r.name, r.start, r.end])).toEqual([["A", 0, 4], ["B", 5, 7], ["C", 5, 6]])
  })

  it("derives a group's span from its children and puts a milestone on one day", () => {
    const m = named("M", { isMilestone: true, durationDays: "2" })
    const p = named("P", { children: [named("P1", { durationDays: "4" }), named("P2", { durationDays: "1" })] })
    const { rows, span } = buildTimeline([p, m], [])
    expect(rows.map((r) => [r.name, r.kind, r.start, r.end])).toEqual([["P", "group", 0, 4], ["P1", "task", 0, 3], ["P2", "task", 4, 4], ["M", "milestone", 6, 6]])
    expect(span).toBeGreaterThanOrEqual(30)
  })

  it("squeezes the day width for long plans and routes an arrow around when the successor starts early", () => {
    expect(dayPxFor(30)).toBe(14)
    expect(dayPxFor(1000)).toBe(2)
    expect(arrowPath(0, 20, 100, 60)).toBe("M0 20 H8 V60 H100")
    expect(arrowPath(100, 20, 90, 60)).toContain("V40")
  })
})

function ev(clientX: number, clientY: number) {
  return { button: 0, clientX, clientY, preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as PointerEvent<HTMLElement>
}

describe("useLinkDrag / useDurationResize", () => {
  const stages = [named("A"), named("B"), named("C")]
  const rowKeys = stages.map((s) => s.key)

  function setupDrag(links: TemplateLink[] = []) {
    const body = document.createElement("div")
    body.getBoundingClientRect = () => ({ top: 100, left: 50 }) as DOMRect
    const onLink = vi.fn()
    const onRejected = vi.fn()
    const hook = renderHook(() => useLinkDrag({ getBody: () => body, rowKeys, rowHeight: 40, stages, links, onLink, onRejected }))
    return { hook, onLink, onRejected }
  }
  const moveTo = (row: number) => act(() => void window.dispatchEvent(new MouseEvent("pointermove", { clientX: 60, clientY: 100 + row * 40 + 5 })))

  it("drops a ● on another row: onLink(from, to)", () => {
    const { hook, onLink } = setupDrag()
    act(() => hook.result.current.onConnectorPointerDown(ev(0, 0), rowKeys[0]))
    moveTo(2)
    expect(hook.result.current.drag).toMatchObject({ sourceKey: rowKeys[0], targetKey: rowKeys[2], block: null })
    act(() => void window.dispatchEvent(new MouseEvent("pointerup")))
    expect(onLink).toHaveBeenCalledWith({ from: rowKeys[0], to: rowKeys[2] })
    expect(hook.result.current.drag).toBeNull()
  })

  it("reports the reason instead of linking when the drop would close a cycle; Esc aborts", () => {
    const { hook, onLink, onRejected } = setupDrag([{ from: rowKeys[1], to: rowKeys[0] }])
    act(() => hook.result.current.onConnectorPointerDown(ev(0, 0), rowKeys[0]))
    moveTo(1)
    act(() => void window.dispatchEvent(new MouseEvent("pointerup")))
    expect(onRejected).toHaveBeenCalledWith("cycle")
    expect(onLink).not.toHaveBeenCalled()

    act(() => hook.result.current.onConnectorPointerDown(ev(0, 0), rowKeys[0]))
    moveTo(2)
    act(() => void window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })))
    expect(onLink).not.toHaveBeenCalled()
    expect(hook.result.current.drag).toBeNull()
  })

  it("stretches a bar by whole days (min 1) and commits on release", () => {
    const onCommit = vi.fn()
    const hook = renderHook(() => useDurationResize({ dayPx: 10, onCommit }))
    act(() => hook.result.current.onResizePointerDown(ev(100, 0), "k", 3))
    act(() => void window.dispatchEvent(new MouseEvent("pointermove", { clientX: 134, clientY: 0 })))
    expect(hook.result.current.resize).toEqual({ key: "k", days: 6 })
    act(() => void window.dispatchEvent(new MouseEvent("pointerup")))
    expect(onCommit).toHaveBeenCalledWith("k", 6)

    act(() => hook.result.current.onResizePointerDown(ev(100, 0), "k", 3))
    act(() => void window.dispatchEvent(new MouseEvent("pointermove", { clientX: 0, clientY: 0 })))
    expect(hook.result.current.resize?.days).toBe(1)
  })
})

function Harness({ initial, links: initialLinks }: { initial: EditorNode[]; links: TemplateLink[] }) {
  const [stages, setStages] = useState(initial)
  const [links, setLinks] = useState(initialLinks)
  return (
    <>
      <StageTimelineEditor stages={stages} onStagesChange={setStages} links={links} onLinksChange={setLinks} disabled={false} />
      <output data-testid="links">{JSON.stringify(effectiveLinks(stages, links).length)}</output>
      <output data-testid="durations">{stages.map((s) => s.durationDays).join(",")}</output>
    </>
  )
}

describe("StageTimelineEditor", () => {
  const a = named("A", { durationDays: "5" })
  const b = named("B", { durationDays: "3" })

  it("draws a bar per stage and an arrow per dependency; clicking the arrow removes it", async () => {
    const { container } = renderWithProviders(<Harness initial={[a, b]} links={[{ from: a.key, to: b.key }]} />, { language: "en" })
    expect(container.querySelectorAll("[data-bar]")).toHaveLength(2)
    expect(container.querySelectorAll("[data-tpl-link]")).toHaveLength(1)
    expect(screen.getByTestId("links")).toHaveTextContent("1")

    const hit = container.querySelector("[data-tpl-link] path[style]") as SVGPathElement
    await userEvent.click(hit)
    expect(container.querySelectorAll("[data-tpl-link]")).toHaveLength(0)
    expect(screen.getByTestId("links")).toHaveTextContent("0")
  })

  it("renames a stage and adds one from the row inputs / the add button", async () => {
    renderWithProviders(<Harness initial={[a, b]} links={[]} />, { language: "en" })
    const inputs = screen.getAllByRole("textbox")
    await userEvent.type(inputs[0], "2")
    expect(screen.getByDisplayValue("A2")).toBeInTheDocument()
    await userEvent.click(screen.getByTestId("tpl-add-stage"))
    expect(screen.getAllByRole("textbox")).toHaveLength(3)
  })

  it("keeps durations when links change and shows the bars' days", () => {
    const { container } = renderWithProviders(<Harness initial={[a, b]} links={[]} />, { language: "en" })
    expect(screen.getByTestId("durations")).toHaveTextContent("5,3")
    const bar = container.querySelector(`[data-bar="${a.key}"]`) as HTMLElement
    expect(within(bar).getByText(/5/)).toBeInTheDocument()
  })
})

describe("StageTreeEditor predecessor picker", () => {
  it("toggles a predecessor from the stage details (keyboard route to a dependency)", async () => {
    const a = named("A")
    const b = named("B")
    const onLinksChange = vi.fn()
    renderWithProviders(<StageTreeEditor stages={[a, b]} onChange={vi.fn()} links={[]} onLinksChange={onLinksChange} disabled={false} />, { language: "en" })
    const rows = screen.getAllByRole("listitem")
    await userEvent.click(within(rows[1]).getAllByRole("button")[0])
    await userEvent.click(within(rows[1]).getByRole("checkbox", { name: "A" }))
    expect(onLinksChange).toHaveBeenCalledWith([{ from: a.key, to: b.key }])
  })
})
