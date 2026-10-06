import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { render } from "@testing-library/react"

const session = vi.hoisted(() => ({ status: "authenticated" as string, pathname: "/projects/p1/sprints" }))
vi.mock("next-auth/react", () => ({ useSession: () => ({ status: session.status }) }))
vi.mock("next/navigation", () => ({ usePathname: () => session.pathname }))

const { RealtimeProvider } = await import("../realtime-provider")

class FakeSource {
  static all: FakeSource[] = []
  closed = false
  onopen = null
  onmessage = null
  onerror = null
  readyState = 0
  constructor(readonly url: string) {
    FakeSource.all.push(this)
  }
  close() {
    this.closed = true
  }
}

beforeEach(() => {
  FakeSource.all = []
  vi.stubGlobal("EventSource", FakeSource)
  session.status = "authenticated"
  session.pathname = "/projects/p1/sprints"
})
afterEach(() => vi.unstubAllGlobals())

describe("RealtimeProvider", () => {
  it("opens one stream for the routed project while signed in and re-subscribes on a project change", () => {
    const view = render(<RealtimeProvider><p>child</p></RealtimeProvider>)
    expect(view.getByText("child")).toBeInTheDocument()
    expect(FakeSource.all.map((s) => s.url)).toEqual(["/api/realtime?projectId=p1"])

    session.pathname = "/projects/p1/backlog"
    view.rerender(<RealtimeProvider><p>child</p></RealtimeProvider>)
    expect(FakeSource.all).toHaveLength(1)

    session.pathname = "/"
    view.rerender(<RealtimeProvider><p>child</p></RealtimeProvider>)
    expect(FakeSource.all[0].closed).toBe(true)
    expect(FakeSource.all.at(-1)?.url).toBe("/api/realtime")

    view.unmount()
    expect(FakeSource.all.every((s) => s.closed)).toBe(true)
  })

  it("opens nothing while signed out", () => {
    session.status = "unauthenticated"
    render(<RealtimeProvider><p>child</p></RealtimeProvider>)
    expect(FakeSource.all).toHaveLength(0)
  })
})
