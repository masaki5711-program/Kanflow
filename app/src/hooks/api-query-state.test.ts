import { describe, expect, it } from "vitest"
import { initialQueryState, isCurrentRequest, queryReducer, requestKey, selectQueryView, type QueryState } from "./api-query-state"

type Items = string[]

function settle(state: QueryState<Items>, url: string, data: Items): QueryState<Items> {
  return queryReducer(state, { type: "success", key: requestKey(url, state.reloadToken)!, url, data })
}

describe("api query state", () => {
  it("is loading until the first response for the URL arrives", () => {
    const state = initialQueryState<Items>()
    expect(selectQueryView(state, "/a", undefined)).toEqual({ data: undefined, error: null, isLoading: true, isFetching: true })
  })

  it("is idle when the URL is null (disabled)", () => {
    const view = selectQueryView(initialQueryState<Items>(), null, undefined)
    expect(view.isLoading).toBe(false)
    expect(view.isFetching).toBe(false)
  })

  it("exposes data after success", () => {
    const state = settle(initialQueryState(), "/a", ["x"])
    expect(selectQueryView(state, "/a", undefined)).toEqual({ data: ["x"], error: null, isLoading: false, isFetching: false })
  })

  it("never shows data of a previous URL after the URL changes", () => {
    const state = settle(initialQueryState(), "/projects/1", ["p1"])
    const view = selectQueryView(state, "/projects/2", undefined)
    expect(view.data).toBeUndefined()
    expect(view.isLoading).toBe(true)
  })

  it("treats a late response for an old key as stale", () => {
    const oldKey = requestKey("/projects/1", 0)!
    const currentKey = requestKey("/projects/2", 0)
    expect(isCurrentRequest(oldKey, currentKey)).toBe(false)
    expect(isCurrentRequest(currentKey!, currentKey)).toBe(true)
  })

  it("keeps showing data during a refetch (isFetching but not isLoading)", () => {
    let state = settle(initialQueryState(), "/a", ["x"])
    state = queryReducer(state, { type: "reload" })
    const view = selectQueryView(state, "/a", undefined)
    expect(view).toMatchObject({ data: ["x"], isLoading: false, isFetching: true })
  })

  it("keeps stale data but reports the error when a refetch fails", () => {
    let state = settle(initialQueryState(), "/a", ["x"])
    state = queryReducer(state, { type: "reload" })
    const error = new Error("boom")
    state = queryReducer(state, { type: "error", key: requestKey("/a", state.reloadToken)!, url: "/a", error })
    expect(selectQueryView(state, "/a", undefined)).toEqual({ data: ["x"], error, isLoading: false, isFetching: false })
  })

  it("drops data of another URL when that URL errors", () => {
    let state = settle(initialQueryState(), "/a", ["x"])
    state = queryReducer(state, { type: "error", key: requestKey("/b", 0)!, url: "/b", error: new Error("nope") })
    expect(selectQueryView(state, "/b", undefined).data).toBeUndefined()
  })

  it("falls back to initialData before the first response", () => {
    const view = selectQueryView(initialQueryState<Items>(), "/a", ["seed"])
    expect(view).toMatchObject({ data: ["seed"], isLoading: false, isFetching: true })
  })

  it("mutate applies an updater to the visible data without mutating it", () => {
    const loaded = settle(initialQueryState(), "/a", ["x"])
    const next = queryReducer(loaded, { type: "mutate", url: "/a", fallback: undefined, updater: (prev) => [...(prev ?? []), "y"] })
    expect(selectQueryView(next, "/a", undefined).data).toEqual(["x", "y"])
    expect(loaded.data).toEqual(["x"])
  })

  it("mutate starts from initialData when nothing is loaded yet", () => {
    const next = queryReducer(initialQueryState<Items>(), { type: "mutate", url: "/a", fallback: ["seed"], updater: (p) => [...(p ?? []), "new"] })
    expect(next.data).toEqual(["seed", "new"])
  })
})
