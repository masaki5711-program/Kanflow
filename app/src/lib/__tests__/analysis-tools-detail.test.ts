import { beforeEach, describe, expect, it, vi } from "vitest"

const m = vi.hoisted(() => ({
  pbiFindFirst: vi.fn(),
  iceboxFindFirst: vi.fn(),
  taskFindFirst: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    productBacklogItem: { findFirst: m.pbiFindFirst },
    iceboxItem: { findFirst: m.iceboxFindFirst },
    sprintBacklogItem: { findFirst: m.taskFindFirst },
  },
}))

const { DETAIL_TOOL_DEFS, detailHandlers } = await import("@/lib/analysis-tools-detail")

const run = async (args: Record<string, unknown>) => JSON.parse(await detailHandlers.get_work_item_details({ projectId: "p1", args }))

const PBI_ROW = {
  displayId: 25,
  status: "ready",
  workloadScore: 3,
  initiative: "IoT プラットフォームの構築（共有クレート）",
  epic: "共通基盤と運用",
  userStory: "開発者として、PFE と PFS で共通の型を使いたい。",
  acceptanceCriteria: "- 共通クレートがビルドできる\n- 両方から参照できる",
  referenceDoc: "仕様書 3.2 章",
  assignedPo: "PO 太郎",
  poNote: null,
  notReadyReason: null,
  productGoal: { title: "量産ライン接続" },
  planItem: { name: "基盤構築" },
  iceboxItem: null,
  attachments: [{ id: "att1", originalName: "spec.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }],
  predecessorDeps: [{ predecessor: { displayId: 24, initiative: "環境準備", status: "completed" } }],
  successorDeps: [],
  sprintItems: [{ id: "t1", taskName: "Cargo workspace 作成", status: "in_progress", assignee: null, assignees: [{ user: { name: "Dev A" } }], sprint: { sprintName: "S9", status: "active" } }],
  gitLinks: [{ title: "PBI-25 shared crate", state: "opened", pipeline: "success", author: "Dev A", repository: { name: "edge" } }],
}

beforeEach(() => vi.clearAllMocks())

describe("get_work_item_details", () => {
  it("is offered as one tool with a handler", () => {
    expect(DETAIL_TOOL_DEFS.map((d) => d.function.name)).toEqual(["get_work_item_details"])
    expect(Object.keys(detailHandlers)).toEqual(["get_work_item_details"])
  })

  it("returns the full PBI content, scoped to the project and live rows", async () => {
    m.pbiFindFirst.mockResolvedValue(PBI_ROW)
    const out = await run({ kind: "pbi", id: "#25" })
    expect(m.pbiFindFirst.mock.calls[0][0].where).toMatchObject({ projectId: "p1", displayId: 25, deletedAt: null })
    expect(out).toMatchObject({
      id: "#25",
      user_story: PBI_ROW.userStory,
      acceptance_criteria: PBI_ROW.acceptanceCriteria,
      reference_material: "仕様書 3.2 章",
      reference_files: [{ attachment_id: "att1", name: "spec.docx" }],
      blocked_by: [{ id: "#24", status: "completed" }],
      tasks: [{ task_id: "t1", name: "Cargo workspace 作成", assignees: "Dev A" }],
      merge_requests: [{ title: "PBI-25 shared crate", state: "opened", repository: "edge" }],
    })
  })

  it("truncates very long text", async () => {
    m.pbiFindFirst.mockResolvedValue({ ...PBI_ROW, userStory: "あ".repeat(5000) })
    const out = await run({ kind: "pbi", id: "25" })
    expect(out.user_story.length).toBeLessThan(4100)
    expect(out.user_story).toContain("(truncated)")
  })

  it("reports a missing PBI and a malformed number", async () => {
    m.pbiFindFirst.mockResolvedValue(null)
    expect((await run({ kind: "pbi", id: "99" })).error).toContain("#99")
    expect((await run({ kind: "pbi", id: "abc" })).error).toBeDefined()
    expect((await run({ kind: "other", id: "1" })).error).toBeDefined()
  })

  it("returns an IceBox request with its memos", async () => {
    m.iceboxFindFirst.mockResolvedValue({
      displayId: 7, status: "accepted", author: "Floor", request: "要望本文", background: "背景", policyDoc: null, planningDoc: null,
      assignedPo: null, poHearingMemo: "ヒアリング", poReviewMemo: null, rejectionReason: null, freezeReason: null, pbEpic: null,
      attachments: [{ originalName: "photo.jpg" }], backlogItems: [{ displayId: 25, initiative: "x", status: "ready" }],
    })
    const out = await run({ kind: "icebox", id: 7 })
    expect(out).toMatchObject({ id: "#7", request: "要望本文", background: "背景", po_hearing_memo: "ヒアリング", attachments: ["photo.jpg"], became_pbis: [{ id: "#25" }] })
  })

  it("returns a task by task_id, scoped through its sprint's project", async () => {
    m.taskFindFirst.mockResolvedValue({
      id: "t1", taskName: "Cargo workspace 作成", status: "done", assignee: null, assignees: [], estimatedHours: 2, actualHours: 3, completionComment: "完了",
      sprint: { sprintName: "S9", status: "active", startDate: new Date("2026-09-01T00:00:00Z"), endDate: new Date("2026-09-14T00:00:00Z") },
      pbItem: { displayId: 25, initiative: "共有クレート", userStory: "story" },
    })
    const out = await run({ kind: "task", id: "t1" })
    expect(m.taskFindFirst.mock.calls[0][0].where).toMatchObject({ id: "t1", sprint: { projectId: "p1" } })
    expect(out).toMatchObject({ task_id: "t1", completion_comment: "完了", sprint: { start: "2026-09-01", end: "2026-09-14" }, pbi: { id: "#25" } })
    expect((await run({ kind: "task", id: "" })).error).toBeDefined()
  })
})
