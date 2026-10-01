import { afterEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { jsonResponse, renderWithProviders, stubFetch, tr } from "@/app/__tests__/test-utils"
import { PbiDependencySection } from "../pbi-dependency-section"
import type { PbiDependencyRefDto } from "@/types/api"

const t = tr("ja")

const ref = (id: string, displayId: number, status = "ready"): PbiDependencyRefDto => ({
  dependencyId: `dep-${id}`,
  id,
  displayId,
  initiative: `Initiative ${id}`,
  userStory: null,
  status,
  i18n: {},
})

const BACKLOG = "/api/projects/p1/backlog"
const BASE = "/api/projects/p1/backlog/dependencies"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("PbiDependencySection", () => {
  it("lists both sides and renders their done/waiting state", () => {
    renderWithProviders(
      <PbiDependencySection
        projectId="p1"
        item={{ id: "x", displayId: 9, blockedBy: [ref("a", 1, "completed")], blocking: [ref("b", 2, "ready")] }}
        label="#9 X"
        canEdit
        onChanged={() => {}}
      />,
    )
    expect(screen.getByText(t.depBlockedByTitle)).toBeInTheDocument()
    expect(screen.getByText(t.depBlockingTitle)).toBeInTheDocument()
    expect(screen.getByText("#1 Initiative a")).toBeInTheDocument()
    expect(screen.getByText("#2 Initiative b")).toBeInTheDocument()
  })

  it("shows 'none' for an empty side", () => {
    renderWithProviders(
      <PbiDependencySection projectId="p1" item={{ id: "x", displayId: 9 }} label="#9 X" canEdit onChanged={() => {}} />,
    )
    expect(screen.getAllByText(t.depNone)).toHaveLength(2)
  })

  it("remove issues a DELETE of the link and calls onChanged", async () => {
    const onChanged = vi.fn()
    const calls = stubFetch([
      { match: /\/api\/projects\/p1\/backlog\/dependencies\/dep-a$/, method: "DELETE", respond: () => jsonResponse(undefined) },
    ])
    renderWithProviders(
      <PbiDependencySection
        projectId="p1"
        item={{ id: "x", displayId: 9, blockedBy: [ref("a", 1)] }}
        label="#9 X"
        canEdit
        onChanged={onChanged}
      />,
    )
    await userEvent.click(screen.getByRole("button", { name: t.depRemove.replace("{name}", "#1 Initiative a") }))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(calls.mock.calls.some(([input, init]) => String(input).endsWith("/dep-a") && init?.method === "DELETE")).toBe(true)
  })

  it("add (blockedBy): opens the picker and POSTs { predecessorId: picked, successorId: self }", async () => {
    const onChanged = vi.fn()
    const calls = stubFetch([
      { match: BACKLOG, method: "GET", respond: () => jsonResponse({ readyItems: [{ id: "cand", displayId: 5, initiative: "Candidate", userStory: null, status: "ready", i18n: {} }], notReadyItems: [], completedItems: [] }) },
      { match: BASE, method: "POST", respond: () => jsonResponse({ id: "newdep" }) },
    ])
    renderWithProviders(
      <PbiDependencySection projectId="p1" item={{ id: "x", displayId: 9 }} label="#9 X" canEdit onChanged={onChanged} />,
    )
    await userEvent.click(screen.getByRole("button", { name: t.depAddBlockedBy }))
    const candidate = await screen.findByText("#5 Candidate")
    await userEvent.click(candidate)
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    const post = calls.mock.calls.find(([, init]) => init?.method === "POST")
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ predecessorId: "cand", successorId: "x" })
  })

  it("add (blocking): POSTs { predecessorId: self, successorId: picked }", async () => {
    const onChanged = vi.fn()
    const calls = stubFetch([
      { match: BACKLOG, method: "GET", respond: () => jsonResponse({ readyItems: [{ id: "cand", displayId: 5, initiative: "Candidate", userStory: null, status: "ready", i18n: {} }], notReadyItems: [], completedItems: [] }) },
      { match: BASE, method: "POST", respond: () => jsonResponse({ id: "newdep" }) },
    ])
    renderWithProviders(
      <PbiDependencySection projectId="p1" item={{ id: "x", displayId: 9 }} label="#9 X" canEdit onChanged={onChanged} />,
    )
    await userEvent.click(screen.getByRole("button", { name: t.depAddBlocking }))
    const candidate = await screen.findByText("#5 Candidate")
    await userEvent.click(candidate)
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    const post = calls.mock.calls.find(([, init]) => init?.method === "POST")
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ predecessorId: "x", successorId: "cand" })
  })

  it("non-editors see neither add nor remove controls", () => {
    renderWithProviders(
      <PbiDependencySection
        projectId="p1"
        item={{ id: "x", displayId: 9, blockedBy: [ref("a", 1)] }}
        label="#9 X"
        canEdit={false}
        onChanged={() => {}}
      />,
    )
    expect(screen.queryByRole("button", { name: t.depAddBlockedBy })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: t.depAddBlocking })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: t.depRemove.replace("{name}", "#1 Initiative a") })).not.toBeInTheDocument()
  })
})
