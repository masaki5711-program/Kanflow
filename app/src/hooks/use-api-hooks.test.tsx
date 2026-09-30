import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import type { ApiError } from "./api-client"
import { useApiQuery } from "./use-api-query"
import { useApiMutation } from "./use-api-mutation"
import { useApiFetch } from "./use-api-fetch"
import { ToastProvider } from "@/components/ui/toast"
import { LanguageProvider } from "@/lib/language-context"

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

interface Deferred {
  url: string
  signal: AbortSignal | undefined
  resolve: (r: Response) => void
  reject: (e: unknown) => void
}

let pending: Deferred[] = []
const fetchMock = vi.fn((url: string, init?: RequestInit) => {
  return new Promise<Response>((resolve, reject) => {
    pending.push({ url, signal: init?.signal ?? undefined, resolve, reject })
    init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))
  })
})

const toastSpy = { error: vi.fn(), success: vi.fn() }
vi.mock("@/components/ui/toast", async (orig) => {
  const mod = await orig<typeof import("@/components/ui/toast")>()
  return {
    ...mod,
    useOptionalToast: () => ({ ...toastSpy, info: vi.fn(), dismiss: vi.fn() }),
  }
})

const wrapper = ({ children }: { children: ReactNode }) => (
  <LanguageProvider>
    <ToastProvider>{children}</ToastProvider>
  </LanguageProvider>
)

beforeEach(() => {
  pending = []
  fetchMock.mockClear()
  toastSpy.error.mockClear()
  toastSpy.success.mockClear()
  vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe("useApiQuery", () => {
  it("loads data and exposes loading flags", async () => {
    const { result } = renderHook(() => useApiQuery<{ n: number }>("/api/a"), { wrapper })
    expect(result.current.isLoading).toBe(true)
    await act(async () => pending[0].resolve(json({ n: 1 })))
    await waitFor(() => expect(result.current.data).toEqual({ n: 1 }))
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isFetching).toBe(false)
  })

  it("aborts the in-flight request on unmount", () => {
    const { unmount } = renderHook(() => useApiQuery("/api/a"), { wrapper })
    const signal = pending[0].signal!
    expect(signal.aborted).toBe(false)
    unmount()
    expect(signal.aborted).toBe(true)
  })

  it("ignores a stale response after the URL changes", async () => {
    const { result, rerender } = renderHook(({ url }) => useApiQuery<string>(url), {
      wrapper,
      initialProps: { url: "/api/old" },
    })
    const old = pending[0]
    rerender({ url: "/api/new" })
    expect(old.signal!.aborted).toBe(true)
    const fresh = pending[1]
    await act(async () => fresh.resolve(json("new")))
    await waitFor(() => expect(result.current.data).toBe("new"))
    // The old request resolving late must not overwrite the fresh data.
    await act(async () => old.resolve(json("old")))
    expect(result.current.data).toBe("new")
  })

  it("does not fetch when url is null or enabled is false; returns initialData", () => {
    const { result } = renderHook(() => useApiQuery<number>("/api/x", { enabled: false, initialData: 7 }), {
      wrapper,
    })
    const { result: r2 } = renderHook(() => useApiQuery<number>(null), { wrapper })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current.data).toBe(7)
    expect(r2.current.isLoading).toBe(false)
  })

  it("applies parse, reports errors and toasts when asked", async () => {
    const { result } = renderHook(
      () => useApiQuery<number>("/api/p", { parse: (raw) => (raw as { v: number }).v * 2, toastOnError: (e) => `X ${e.message}` }),
      { wrapper },
    )
    await act(async () => pending[0].resolve(json({ v: 21 })))
    await waitFor(() => expect(result.current.data).toBe(42))

    act(() => result.current.refetch())
    await waitFor(() => expect(pending).toHaveLength(2))
    await act(async () => pending[1].resolve(json({ error: "nope" }, 500)))
    await waitFor(() => expect(result.current.error?.message).toBe("nope"))
    // stale-while-error keeps the previous data
    expect(result.current.data).toBe(42)
    expect(toastSpy.error).toHaveBeenCalledWith("X nope")
  })

  it("uses the error message for toastOnError=true and supports mutate", async () => {
    const { result } = renderHook(() => useApiQuery<number[]>("/api/m", { toastOnError: true }), { wrapper })
    await act(async () => pending[0].reject(new Error("offline")))
    await waitFor(() => expect(result.current.error).not.toBeNull())
    // Network failures carry NETWORK_ERROR and are localized to the UI language (<html lang>, ja here).
    expect(toastSpy.error).toHaveBeenCalledWith("サーバーに接続できません。ネットワークを確認してください")
    expect((result.current.error as ApiError).serverMessage).toBe("offline")
    act(() => result.current.mutate((prev) => [...(prev ?? []), 1]))
    expect(result.current.data).toEqual([1])
  })

  it("mutate is a no-op when there is no URL", () => {
    const { result } = renderHook(() => useApiQuery<number>(null), { wrapper })
    act(() => result.current.mutate(5))
    expect(result.current.data).toBeUndefined()
  })
})

describe("useApiMutation", () => {
  it("applies an optimistic update and rolls back on failure", async () => {
    // Arrange
    let list = ["a", "b"]
    const onError = vi.fn()
    const { result } = renderHook(
      () =>
        useApiMutation<string, unknown, string[]>(
          () => Promise.reject(new Error("server down")),
          {
            onMutate: (id) => {
              const prev = list
              list = list.filter((x) => x !== id)
              return prev
            },
            rollback: (prev) => {
              list = prev
            },
            onError,
            toastOnError: true,
          },
        ),
      { wrapper },
    )
    // Act
    let returned: unknown = "unset"
    await act(async () => {
      returned = await result.current.mutate("a")
    })
    // Assert
    expect(returned).toBeUndefined()
    expect(list).toEqual(["a", "b"])
    expect(onError).toHaveBeenCalledWith(expect.any(Error), "a")
    expect(result.current.error?.message).toBe("server down")
    expect(result.current.isPending).toBe(false)
    expect(toastSpy.error).toHaveBeenCalledWith("server down")
    act(() => result.current.reset())
    expect(result.current.error).toBeNull()
  })

  it("keeps the optimistic change and calls onSuccess + success toast", async () => {
    const onSuccess = vi.fn()
    const rollback = vi.fn()
    const { result } = renderHook(
      () =>
        useApiMutation((n: number) => Promise.resolve(n * 2), {
          onMutate: () => "snap",
          rollback,
          onSuccess,
          toastOnSuccess: (r) => `got ${r}`,
        }),
      { wrapper },
    )
    await act(async () => {
      expect(await result.current.mutateAsync(4)).toBe(8)
    })
    expect(onSuccess).toHaveBeenCalledWith(8, 4)
    expect(rollback).not.toHaveBeenCalled()
    expect(toastSpy.success).toHaveBeenCalledWith("got 8")
  })

  it("reports isPending while in flight and mutateAsync rethrows non-Error values as Error", async () => {
    let reject: (e: unknown) => void = () => {}
    const { result } = renderHook(
      () => useApiMutation(() => new Promise((_, r) => (reject = r)), { toastOnError: (e) => `E:${e.message}`, toastOnSuccess: "ok" }),
      { wrapper },
    )
    let p: Promise<unknown> = Promise.resolve()
    act(() => {
      p = result.current.mutateAsync(undefined)
    })
    expect(result.current.isPending).toBe(true)
    await act(async () => {
      reject("plain")
      await expect(p).rejects.toThrow("plain")
    })
    expect(result.current.isPending).toBe(false)
    expect(toastSpy.error).toHaveBeenCalledWith("E:plain")
  })
})

describe("useApiFetch", () => {
  it("toasts success text and returns the result", async () => {
    const { result } = renderHook(() => useApiFetch(), { wrapper })
    let out: unknown
    await act(async () => {
      const p = result.current("/api/f", { toastOnSuccess: "Saved!" })
      pending[0].resolve(json({ ok: 1 }))
      out = await p
    })
    expect(out).toEqual({ ok: 1 })
    expect(toastSpy.success).toHaveBeenCalledWith("Saved!")
  })

  it("toasts the error (custom text) and rethrows", async () => {
    const { result } = renderHook(() => useApiFetch(), { wrapper })
    await act(async () => {
      const p = result.current("/api/f", { toastOnError: (e) => `oops: ${e.message}` })
      pending[0].resolve(json({ error: "bad" }, 400))
      await expect(p).rejects.toThrow("bad")
    })
    expect(toastSpy.error).toHaveBeenCalledWith("oops: bad")
  })

  it("does not toast aborted requests", async () => {
    const { result } = renderHook(() => useApiFetch(), { wrapper })
    const controller = new AbortController()
    await act(async () => {
      const p = result.current("/api/f", { toastOnError: true, signal: controller.signal })
      controller.abort()
      await expect(p).rejects.toMatchObject({ name: "AbortError" })
    })
    expect(toastSpy.error).not.toHaveBeenCalled()
  })

  it("toasts the plain error message when toastOnError is true", async () => {
    const { result } = renderHook(() => useApiFetch(), { wrapper })
    await act(async () => {
      const p = result.current("/api/f", { toastOnError: true })
      pending[0].resolve(json({ error: "denied" }, 403))
      await expect(p).rejects.toThrow("denied")
    })
    expect(toastSpy.error).toHaveBeenCalledWith("denied")
  })
})
