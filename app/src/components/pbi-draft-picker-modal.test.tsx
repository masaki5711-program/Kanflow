import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { PbiDraftPickerModal } from "./pbi-draft-picker-modal"
import { AppProviders, jsonResponse, stubLayout } from "./__tests__/helpers"
import { getTranslations } from "@/lib/i18n"

stubLayout()
const t = getTranslations("en")

function stream(chunks: string[]): Response {
  const enc = new TextEncoder()
  return new Response(
    new ReadableStream<Uint8Array>({
      start(c) {
        chunks.forEach((x) => c.enqueue(enc.encode(x)))
        c.close()
      },
    }),
  )
}

const DRAFTS = {
  drafts: [
    { initiative: "Init A", epic: "Epic A", userStory: "Story A", acceptanceCriteria: ["AC1", "- AC2"], workloadScore: 4, rationale: "Why A" },
    { initiative: "Init B", epic: "Epic B", userStory: "Story B", acceptanceCriteria: "AC B", workloadScore: 30, rationale: "Why B" },
  ],
}

let icebox: { status: number; bodies: unknown[] }
let draftResponse: () => Promise<Response>

beforeEach(() => {
  icebox = { status: 200, bodies: [] }
  const json = JSON.stringify(DRAFTS)
  draftResponse = async () => stream([json.slice(0, 60), json.slice(60)])
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/icebox")) {
        icebox.bodies.push(JSON.parse(String(init?.body)))
        return icebox.status === 200 ? jsonResponse({ id: "new" }) : jsonResponse({ error: "full" }, icebox.status)
      }
      return draftResponse()
    }),
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
})

function renderPicker() {
  const onPick = vi.fn()
  const onClose = vi.fn()
  const onAddedToIcebox = vi.fn()
  const utils = render(
    <AppProviders>
      <PbiDraftPickerModal projectId="p1" iceboxItemId="i1" onClose={onClose} onPick={onPick} onAddedToIcebox={onAddedToIcebox} />
    </AppProviders>,
  )
  return { onPick, onClose, onAddedToIcebox, ...utils }
}

describe("PbiDraftPickerModal", () => {
  it("streams drafts into fixed slots and picks a draft with the workload snapped to the SP scale (ties snap down)", async () => {
    const { onPick } = renderPicker()
    expect(await screen.findByText("Init A")).toBeInTheDocument()
    await screen.findByText(t.aiResultDisclaimer)
    const cards = screen.getAllByRole("article")
    expect(cards).toHaveLength(3)
    expect(within(cards[0]).getByText("3 SP")).toBeInTheDocument()
    expect(within(cards[1]).getByText("21 SP")).toBeInTheDocument()
    expect(cards[2]).toHaveAttribute("aria-busy", "true")
    expect(within(cards[2]).getByRole("button", { name: t.aiUseThisDraft })).toBeDisabled()

    await userEvent.click(within(cards[0]).getByRole("button", { name: t.aiUseThisDraft }))
    expect(onPick).toHaveBeenCalledWith({
      initiative: "Init A",
      epic: "Epic A",
      userStory: "Story A",
      acceptanceCriteria: "1. AC1\n- AC2",
      workloadScore: 3,
      rationale: "Why A",
    })
  })

  it("saves a runner-up draft to the Icebox once", async () => {
    const { onAddedToIcebox } = renderPicker()
    await screen.findByText(t.aiResultDisclaimer)
    const card = screen.getAllByRole("article")[1]
    await userEvent.click(within(card).getByRole("button", { name: new RegExp(t.aiAddDraftToIcebox) }))
    await waitFor(() => expect(onAddedToIcebox).toHaveBeenCalledTimes(1))
    expect(icebox.bodies).toEqual([{ request: "Init B\nStory B", background: "Why B\n\nAC B" }])
    const done = within(card).getByRole("button", { name: new RegExp(t.aiDraftAddedToIcebox) })
    expect(done).toBeDisabled()
  })

  it("toasts when saving to the Icebox fails and allows retry", async () => {
    icebox.status = 500
    const { onAddedToIcebox } = renderPicker()
    await screen.findByText(t.aiResultDisclaimer)
    const card = screen.getAllByRole("article")[0]
    const button = within(card).getByRole("button", { name: new RegExp(t.aiAddDraftToIcebox) })
    await userEvent.click(button)
    expect(await screen.findByText("full")).toBeInTheDocument()
    expect(onAddedToIcebox).not.toHaveBeenCalled()
    await waitFor(() => expect(button).toBeEnabled())
  })

  it("shows an error alert for HTTP failures", async () => {
    draftResponse = async () => new Response("model offline", { status: 503 })
    renderPicker()
    const alert = await within(screen.getByRole("dialog")).findByRole("alert")
    expect(alert).toHaveTextContent(`${t.aiFailed} (HTTP 503: model offline)`)
  })

  it("treats an [error] marker in the stream as a failure", async () => {
    draftResponse = async () => stream(['{"drafts":[', "[error] boom"])
    renderPicker()
    const alert = await within(screen.getByRole("dialog")).findByRole("alert")
    expect(alert).toHaveTextContent("stream_error")
  })

  it("aborts the generation when closed", async () => {
    let signal: AbortSignal | undefined
    draftResponse = () => new Promise(() => {})
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        signal = init?.signal ?? undefined
        return draftResponse()
      }),
    )
    const { unmount } = renderPicker()
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    unmount()
    expect(signal?.aborted).toBe(true)
  })
})
