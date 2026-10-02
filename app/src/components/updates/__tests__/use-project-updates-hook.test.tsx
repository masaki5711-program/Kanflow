import { describe, expect, it, vi } from "vitest"
import { act, renderHook, waitFor } from "@testing-library/react"
import { jsonResponse, stubFetch } from "@/app/__tests__/test-utils"
import { PROJECT_UPDATES_EVENT, announceUpdatesChanged, useProjectUpdates } from "../use-project-updates"

describe("announceUpdatesChanged", () => {
  it("dispatches the project-updates event with the project id as detail", () => {
    const handler = vi.fn()
    window.addEventListener(PROJECT_UPDATES_EVENT, handler)
    announceUpdatesChanged("p1")
    expect(handler).toHaveBeenCalledTimes(1)
    expect((handler.mock.calls[0][0] as CustomEvent<string>).detail).toBe("p1")
    window.removeEventListener(PROJECT_UPDATES_EVENT, handler)
  })
})

describe("useProjectUpdates", () => {
  it("loads the project's updates, marks one notification read and announces the change", async () => {
    const fetchMock = stubFetch([
      { match: "/api/projects/p1/updates", respond: () => jsonResponse({ newActivity: 2, unread: 1, mentions: 0, notifications: [], activity: [] }) },
      { match: "/api/notifications/n1/read", method: "POST", respond: () => jsonResponse(undefined) },
    ])
    const onChanged = vi.fn()
    window.addEventListener(PROJECT_UPDATES_EVENT, onChanged)
    const { result } = renderHook(() => useProjectUpdates("p1"))
    await waitFor(() => expect(result.current.data?.newActivity).toBe(2))

    await act(() => result.current.markRead("n1"))
    expect(fetchMock).toHaveBeenCalledWith("/api/notifications/n1/read", expect.objectContaining({ method: "POST" }))
    expect(onChanged).toHaveBeenCalledTimes(1)
    window.removeEventListener(PROJECT_UPDATES_EVENT, onChanged)
  })

  it("marking all seen posts to the seen endpoint, announces and reloads", async () => {
    let seenCalls = 0
    const fetchMock = stubFetch([
      {
        match: "/api/projects/p1/updates",
        respond: () => jsonResponse({ newActivity: seenCalls, unread: 0, mentions: 0, notifications: [], activity: [] }),
      },
      {
        match: "/api/projects/p1/updates/seen",
        method: "POST",
        respond: () => {
          seenCalls++
          return jsonResponse(undefined)
        },
      },
    ])
    const { result } = renderHook(() => useProjectUpdates("p1"))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(() => result.current.markAllSeen())
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/p1/updates/seen", expect.objectContaining({ method: "POST" }))
    await waitFor(() => expect(result.current.data?.newActivity).toBe(1))
  })
})
