import { describe, expect, it } from "vitest"
import { useState } from "react"
import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderWithProviders, tr } from "@/app/__tests__/test-utils"
import { builtinByKey } from "@/lib/plan-templates/builtins"
import { contentFromForm, emptyForm, emptyStage, formFromTemplate, parseDuration, validateTemplateForm, type EditorNode } from "../lib/editor-state"
import { StageTreeEditor } from "../stage-tree-editor"

const t = tr("en")

describe("editor-state", () => {
  it("round-trips a built-in template through the form", () => {
    const b = builtinByKey("equipment")!
    const form = formFromTemplate({ name: b.name, description: b.description, visibility: "public", content: b.content })
    expect(contentFromForm(form)).toEqual(b.content)
  })

  it("validates name, stages, blank stage names; parses durations", () => {
    expect(validateTemplateForm(emptyForm())).toBe("name")
    expect(validateTemplateForm({ ...emptyForm(), name: "x", stages: [] })).toBe("stagesRequired")
    expect(validateTemplateForm({ ...emptyForm(), name: "x" })).toBe("stageName")
    expect(validateTemplateForm({ ...emptyForm(), name: "x", stages: [emptyStage("a")] })).toBeNull()
    expect(parseDuration("12")).toBe(12)
    expect(parseDuration("0")).toBeUndefined()
    expect(parseDuration("1.5")).toBeUndefined()
    expect(parseDuration("")).toBeUndefined()
  })

  it("keeps a leaf's role (trimmed), drops a parent's, and refuses an invalid one", () => {
    const parent = { ...emptyStage("p"), role: "lead", children: [{ ...emptyStage("c"), role: " design " }] }
    const form = { ...emptyForm(), name: "x", stages: [parent, { ...emptyStage("d"), role: "" }] }
    expect(contentFromForm(form).stages).toEqual([{ name: "p", children: [{ name: "c", role: "design" }] }, { name: "d" }])
    expect(validateTemplateForm(form)).toBeNull()
    expect(validateTemplateForm({ ...form, stages: [{ ...emptyStage("e"), role: "設計" }] })).toBe("stageRole")
    expect(validateTemplateForm({ ...form, stages: [{ ...emptyStage("e"), role: "__x" }] })).toBe("stageRole")
    // A parent's role is never saved, so it never blocks saving.
    expect(validateTemplateForm({ ...form, stages: [{ ...emptyStage("p"), role: "bad role", children: [emptyStage("c")] }] })).toBeNull()
    expect(formFromTemplate({ name: "x", description: null, visibility: "public", content: { stages: [{ name: "c", role: "design" }] } }).stages[0].role).toBe("design")
  })

  it("drops blank checks / documents and the milestone flag of parents", () => {
    const parent = { ...emptyStage("p"), isMilestone: true, children: [emptyStage("c")] }
    const content = contentFromForm({
      ...emptyForm(),
      name: "x",
      stages: [parent],
      checks: [{ key: "1", name: " ", criterion: "" }, { key: "2", name: "安全", criterion: " OK " }],
      documents: [{ key: "3", name: "" }, { key: "4", name: "図面" }],
    })
    expect(content).toEqual({ stages: [{ name: "p", children: [{ name: "c" }] }], checks: [{ name: "安全", criterion: "OK" }], documents: ["図面"] })
  })
})

function Harness({ initial }: { initial: EditorNode[] }) {
  const [stages, setStages] = useState(initial)
  return <StageTreeEditor stages={stages} onChange={setStages} disabled={false} />
}

const names = () => screen.getAllByLabelText(t.tplStageName).map((i) => (i as HTMLInputElement).value)
const rowOf = (name: string) => screen.getAllByLabelText(t.tplStageName).find((i) => (i as HTMLInputElement).value === name)!.closest("li")!

describe("StageTreeEditor", () => {
  it("edits a leaf's role in the details; an invalid one is marked at the field and keeps the details open", async () => {
    renderWithProviders(<Harness initial={[{ ...emptyStage("A"), children: [emptyStage("A1")] }, emptyStage("B")]} />, { language: "en" })
    await userEvent.click(within(rowOf("B")).getByRole("button", { name: t.tplStageDetails }))
    const role = within(rowOf("B")).getByRole("textbox", { name: t.tplRole })
    expect(role).toHaveAccessibleDescription(t.tplRoleHint)
    await userEvent.type(role, "bad role")
    expect(role).toHaveAttribute("aria-invalid", "true")
    expect(role).toHaveAccessibleDescription(`${t.tplStageRoleInvalid} ${t.tplRoleHint}`)
    // Collapsing does not hide the problem.
    await userEvent.click(within(rowOf("B")).getByRole("button", { name: t.tplStageDetails }))
    expect(within(rowOf("B")).getByRole("textbox", { name: t.tplRole })).toBeVisible()
    await userEvent.clear(role)
    await userEvent.type(role, "design")
    expect(role).not.toHaveAttribute("aria-invalid")
    // A parent stage takes no role.
    await userEvent.click(within(rowOf("A")).getByRole("button", { name: t.tplStageDetails }))
    const parentRole = within(rowOf("A")).getAllByRole("textbox", { name: t.tplRole })[0]
    expect(parentRole).toBeDisabled()
    expect(parentRole).toHaveAccessibleDescription(t.tplRoleParentHint)
  })

  it("adds, renames, reorders, indents / outdents and removes with buttons; focus follows the stage", async () => {
    renderWithProviders(<Harness initial={[emptyStage("A"), emptyStage("B")]} />, { language: "en" })
    await userEvent.click(screen.getByTestId("tpl-add-stage"))
    expect(names()).toEqual(["A", "B", ""])
    expect(document.activeElement).toBe(screen.getAllByLabelText(t.tplStageName)[2])
    await userEvent.type(document.activeElement as HTMLElement, "C")
    expect(names()).toEqual(["A", "B", "C"])

    const moveUp = within(rowOf("C")).getByRole("button", { name: t.tplMoveUp })
    await userEvent.click(moveUp)
    expect(names()).toEqual(["A", "C", "B"])
    expect(document.activeElement).toBe(within(rowOf("C")).getByRole("button", { name: t.tplMoveUp }))

    await userEvent.click(within(rowOf("C")).getByRole("button", { name: t.tplIndent }))
    expect(rowOf("C").style.marginLeft).toBe("20px")
    expect(within(rowOf("A")).getByRole("checkbox", { name: t.tplMilestone })).toBeDisabled()

    await userEvent.click(within(rowOf("C")).getByRole("button", { name: t.tplOutdent }))
    expect(rowOf("C").style.marginLeft).toBe("0px")
    expect(names()).toEqual(["A", "C", "B"])

    await userEvent.click(within(rowOf("B")).getByRole("button", { name: t.tplRemoveStage }))
    expect(names()).toEqual(["A", "C"])
    expect(within(rowOf("A")).getByRole("button", { name: t.tplMoveUp })).toBeDisabled()
  })

  it("does not offer a fourth level", async () => {
    const deep: EditorNode[] = [{ ...emptyStage("L1"), children: [{ ...emptyStage("L2"), children: [emptyStage("L3")] }] }]
    renderWithProviders(<Harness initial={deep} />, { language: "en" })
    expect(within(rowOf("L3")).getByRole("button", { name: t.tplAddChild })).toBeDisabled()
    expect(within(rowOf("L2")).getByRole("button", { name: t.tplAddChild })).toBeEnabled()
  })
})
