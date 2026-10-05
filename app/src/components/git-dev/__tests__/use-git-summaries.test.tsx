import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { renderHook, screen, waitFor } from "@testing-library/react"
import { jsonResponse, renderWithProviders } from "@/components/__tests__/helpers"
import { useGitSummaries } from "../use-git-summaries"
import { GitPbiBadge, GitSummariesProvider } from "../git-summaries-context"
import { forgetGitState, isGitKnownOff } from "../git-client-state"

let body: unknown
const urls: string[] = []

beforeEach(() => {
  forgetGitState()
  urls.length = 0
  body = { enabled: true, summaries: { b: { openMrs: 1, mergedMrs: 0, branches: 1, pipeline: "running" } } }
  vi.stubGlobal("fetch", vi.fn(async (url: string) => (urls.push(String(url)), jsonResponse(body))))
})
afterEach(() => vi.unstubAllGlobals())

describe("useGitSummaries", () => {
  it("asks once for many PBIs (sorted, de-duplicated) and ignores reordering", async () => {
    const { result, rerender } = renderHook(({ ids }) => useGitSummaries("p1", ids), { initialProps: { ids: ["c", "a", "b", "a"] } })
    await waitFor(() => expect(result.current.enabled).toBe(true))
    expect(urls).toEqual([`/api/projects/p1/git/summary?pbiIds=${encodeURIComponent("a,b,c")}`])
    expect(result.current.summaries.b.openMrs).toBe(1)

    rerender({ ids: ["b", "c", "a"] })
    await new Promise((r) => setTimeout(r, 20))
    expect(urls).toHaveLength(1)
  })

  it("sends no request for an empty list", async () => {
    const { result } = renderHook(() => useGitSummaries("p1", []))
    await new Promise((r) => setTimeout(r, 20))
    expect(urls).toEqual([])
    expect(result.current).toEqual({ enabled: false, summaries: {} })
  })

  it("off → empty map, remembered so the next list does not ask again", async () => {
    body = { enabled: false, summaries: {} }
    const first = renderHook(() => useGitSummaries("p1", ["a"]))
    await waitFor(() => expect(isGitKnownOff("p1")).toBe(true))
    expect(first.result.current.summaries).toEqual({})
    first.unmount()

    const second = renderHook(() => useGitSummaries("p1", ["a", "b"]))
    await new Promise((r) => setTimeout(r, 20))
    expect(urls).toHaveLength(1)
    expect(second.result.current.enabled).toBe(false)
  })

  it("caps the request at 200 PBIs", async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id${String(i).padStart(3, "0")}`)
    renderHook(() => useGitSummaries("p1", ids))
    await waitFor(() => expect(urls).toHaveLength(1))
    const sent = decodeURIComponent(urls[0].split("pbiIds=")[1]).split(",")
    expect(sent).toHaveLength(200)
    expect(sent).toContain("id000")
    expect(sent).not.toContain("id249")
  })
})

describe("GitSummariesProvider / GitPbiBadge", () => {
  it("one request feeds every card badge; PBIs without links show nothing", async () => {
    renderWithProviders(
      <GitSummariesProvider projectId="p1" pbiIds={["a", "b"]}>
        <div data-testid="card-a"><GitPbiBadge pbiId="a" /></div>
        <div data-testid="card-b"><GitPbiBadge pbiId="b" /></div>
        <div data-testid="card-b2"><GitPbiBadge pbiId="b" /></div>
      </GitSummariesProvider>,
      "en",
    )
    expect(await screen.findAllByText("1 open merge request(s), Pipeline: running")).toHaveLength(2)
    expect(screen.getByTestId("card-a")).toBeEmptyDOMElement()
    expect(urls).toHaveLength(1)
  })

  it("renders nothing outside a provider", () => {
    renderWithProviders(<div data-testid="host"><GitPbiBadge pbiId="a" /></div>)
    expect(screen.getByTestId("host")).toBeEmptyDOMElement()
    expect(urls).toEqual([])
  })
})
