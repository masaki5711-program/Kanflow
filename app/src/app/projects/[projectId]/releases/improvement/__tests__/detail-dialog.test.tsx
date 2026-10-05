import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { DetailDialog } from "../detail-dialog"
import type { ImprovementItem } from "../improvement-types"
import type { BoardWriter } from "../use-improvement-board"
import { improvement, renderKaizen } from "./board-fixtures"

type Call = { path: string; method: string; json?: unknown; body?: unknown }
let calls: Call[]
let write: BoardWriter

beforeEach(() => {
  calls = []
  write = vi.fn(async (_id: string, path: string, init: { method: string; json?: unknown; body?: BodyInit }) => {
    calls.push({ path, method: init.method, json: init.json, body: init.body })
    return { ok: true as const }
  })
})

function renderDialog(item: ImprovementItem, permissions = { canManage: true, canTrack: true }) {
  return renderKaizen(
    <DetailDialog projectId="p1" item={item} permissions={permissions} rolloutNames={["第2ライン"]} write={write} onClose={vi.fn()} onDelete={vi.fn()} />,
  )
}

const pendingCheck = { id: "c1", kind: "1m", dueDate: "2099-01-01T00:00:00.000Z", checkedAt: null, result: null, note: null, checkedByName: null, notifiedAt: null }

describe("detail dialog", () => {
  it("saves the effect section as one PATCH and announces it", async () => {
    renderDialog(improvement())
    const effect = screen.getByRole("region", { name: "効果" })
    await userEvent.selectOptions(within(effect).getByLabelText("指標の種類"), "time")
    await userEvent.type(within(effect).getByLabelText("指標名"), "段取り時間")
    await userEvent.type(within(effect).getByLabelText("単位"), "分")
    await userEvent.type(within(effect).getByLabelText("改善前"), "60")
    await userEvent.type(within(effect).getByLabelText("目標"), "30")
    await userEvent.type(within(effect).getByLabelText("改善後"), "４５")
    expect(within(effect).getByText("50%")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "保存" }))
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]).toMatchObject({ path: "", method: "PATCH" })
    expect(calls[0].json).toMatchObject({ metricCategory: "time", metricName: "段取り時間", metricUnit: "分", baselineValue: 60, targetValue: 30, resultValue: 45 })
    expect(await screen.findByText("保存しました")).toBeInTheDocument()
  })

  it("an invalid number blocks saving and warns about a target in the wrong direction", async () => {
    renderDialog(improvement({ baselineValue: 10 }))
    const effect = screen.getByRole("region", { name: "効果" })
    await userEvent.type(within(effect).getByLabelText("改善後"), "abc")
    expect(within(effect).getByText("数字で入れてください")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled()
    await userEvent.type(within(effect).getByLabelText("目標"), "12")
    expect(within(effect).getByText(/目標が改善前より良くなっていません/)).toBeInTheDocument()
  })

  it("stage buttons: 標準化済み needs a link, 定着確認済み needs a sustained check", async () => {
    renderDialog(improvement())
    const stage = screen.getByRole("region", { name: "段階" })
    expect(within(stage).getByRole("button", { name: "標準化済み" })).toBeDisabled()
    expect(within(stage).getByRole("button", { name: "定着確認済み" })).toBeDisabled()
    await userEvent.type(screen.getByLabelText("標準書リンク"), "https://std/1")
    await userEvent.click(within(stage).getByRole("button", { name: "標準化済み" }))
    await waitFor(() => expect(calls[0]?.json).toMatchObject({ kaizenStage: "standardized", manualLink: "https://std/1" }))
    expect(await screen.findByText("段階を「標準化済み」にしました")).toBeInTheDocument()
  })

  it("records a 定着確認 result with its note", async () => {
    renderDialog(improvement({ checks: [pendingCheck] }), { canManage: false, canTrack: true })
    const checks = screen.getByRole("region", { name: "定着確認" })
    await userEvent.type(within(checks).getByLabelText("メモ（1 か月後）"), "手順どおり")
    await userEvent.click(within(checks).getByRole("button", { name: "維持できている" }))
    await waitFor(() => expect(calls).toEqual([{ path: "/checks/c1", method: "PATCH", json: { result: "sustained", note: "手順どおり" }, body: undefined }]))
    expect(await screen.findByText("定着確認を記録しました")).toBeInTheDocument()
  })

  it("a recorded check shows who recorded it and can be undone", async () => {
    renderDialog(improvement({ checks: [{ ...pendingCheck, checkedAt: "2026-10-02T01:00:00.000Z", result: "regressed", checkedByName: "佐藤" }] }))
    const checks = screen.getByRole("region", { name: "定着確認" })
    expect(within(checks).getByText("元に戻った")).toBeInTheDocument()
    expect(within(checks).getByText(/佐藤/)).toBeInTheDocument()
    await userEvent.click(within(checks).getByRole("button", { name: "記録を取り消す" }))
    await waitFor(() => expect(calls[0]).toMatchObject({ path: "/checks/c1", json: { result: null, note: null } }))
  })

  it("adds a rollout target (with suggestions) and changes a status", async () => {
    renderDialog(improvement({ rollouts: [{ id: "ro1", targetName: "YMMA", status: "todo", doneAt: null, sortOrder: 0 }] }))
    const rollout = screen.getByRole("region", { name: "横展開" })
    const input = within(rollout).getByLabelText("横展開先")
    expect(input).toHaveAttribute("list")
    await userEvent.type(input, "第3ライン{Enter}")
    await waitFor(() => expect(calls[0]).toMatchObject({ path: "/rollouts", method: "POST", json: { targetName: "第3ライン" } }))
    await userEvent.click(within(within(rollout).getByRole("group", { name: "YMMA の状況" })).getByRole("button", { name: "完了" }))
    await waitFor(() => expect(calls[1]).toMatchObject({ path: "/rollouts/ro1", method: "PATCH", json: { status: "done" } }))
  })

  it("pasting a screenshot uploads it as an after photo", async () => {
    renderDialog(improvement())
    const after = document.querySelector('[data-photo-phase="after"]') as HTMLElement
    const file = new File([new Uint8Array([137, 80, 78, 71])], "image.png", { type: "image/png" })
    fireEvent.paste(after, { clipboardData: { files: [file] } })
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]).toMatchObject({ path: "/photos", method: "POST" })
    const body = calls[0].body as FormData
    expect(body.get("phase")).toBe("after")
    expect((body.get("file") as File).name).toMatch(/^screenshot-.*\.png$/)
  })

  it("dropping a non-image on the before area is refused with a message", async () => {
    renderDialog(improvement())
    const before = document.querySelector('[data-photo-phase="before"]') as HTMLElement
    const pdf = new File(["%PDF"], "plan.pdf", { type: "application/pdf" })
    fireEvent.drop(before, { dataTransfer: { files: [pdf], types: ["Files"] } })
    expect(await within(before).findByText("plan.pdf は画像ではありません")).toBeInTheDocument()
    expect(calls).toHaveLength(0)
  })

  it("read-only for a viewer without any write permission", () => {
    renderDialog(improvement({ checks: [pendingCheck] }), { canManage: false, canTrack: false })
    expect(screen.queryByRole("button", { name: "保存" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "維持できている" })).not.toBeInTheDocument()
    expect(screen.getByText("まだ確認していません")).toBeInTheDocument()
    expect(screen.getByLabelText("改善前")).toHaveAttribute("readonly")
  })
})
