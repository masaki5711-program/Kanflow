import { afterEach, describe, expect, it, vi } from "vitest"
import { act, renderHook, screen, waitFor } from "@testing-library/react"
import { useState, type ReactNode } from "react"
import { LanguageProvider } from "@/lib/language-context"
import { ToastProvider } from "@/components/ui/toast"
import { tr } from "@/app/__tests__/test-utils"
import { useAiFieldGenerator } from "@/components/pbi-form/use-ai-field-generator"
import { EMPTY_PBI_FORM, type PbiForm } from "@/components/pbi-form/pbi-form-state"
import { useDraftPrefill } from "../use-draft-prefill"
import { matchesQuery } from "../types"
import { pbi } from "./fixtures"

const t = tr("ja")

function wrapper({ children }: { children: ReactNode }) {
  return (
    <LanguageProvider initialLanguage="ja">
      <ToastProvider>{children}</ToastProvider>
    </LanguageProvider>
  )
}

function streamResponse(chunks: string[], status = 200): Response {
  const enc = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c))
      controller.close()
    },
  })
  return new Response(body, { status })
}

function useHarness(initial: Partial<PbiForm>) {
  const [form, setForm] = useState<PbiForm>({ ...EMPTY_PBI_FORM, ...initial })
  const ai = useAiFieldGenerator("p1", form, setForm)
  return { form, ai }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("useAiFieldGenerator", () => {
  it("asks for input first when the form is empty", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const { result } = renderHook(() => useHarness({}), { wrapper })
    await act(() => result.current.ai.generate("userStory"))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(await screen.findByText(t.aiGenerateNeedsInitiative)).toBeInTheDocument()
  })

  it("streams the generated text into the field", async () => {
    const fetchMock = vi.fn(async () => streamResponse(["As a user, ", "I want X"]))
    vi.stubGlobal("fetch", fetchMock)
    const { result } = renderHook(() => useHarness({ initiative: "Login" }), { wrapper })
    await act(() => result.current.ai.generate("userStory"))
    expect(result.current.form.userStory).toBe("As a user, I want X")
    expect(result.current.ai.generating).toBeNull()
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body))
    expect(body).toMatchObject({ field: "userStory", initiative: "Login", lang: "ja" })
  })

  it("restores the previous content and toasts on a stream error marker", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => streamResponse(["partial\n[error] model died"])))
    const { result } = renderHook(() => useHarness({ initiative: "x", acceptanceCriteria: "old" }), { wrapper })
    await act(() => result.current.ai.generate("acceptanceCriteria"))
    expect(result.current.form.acceptanceCriteria).toBe("old")
    expect(await screen.findByText(t.aiFailed)).toBeInTheDocument()
  })

  it("restores and toasts on HTTP failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 503 })))
    const { result } = renderHook(() => useHarness({ userStory: "keep me" }), { wrapper })
    await act(() => result.current.ai.generate("userStory"))
    expect(result.current.form.userStory).toBe("keep me")
    expect(await screen.findByText(t.aiFailed)).toBeInTheDocument()
  })

  it("cancels the running generation when triggered again, without an error toast", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))
          }),
      ),
    )
    const { result } = renderHook(() => useHarness({ initiative: "x", userStory: "orig" }), { wrapper })
    let pending: Promise<void> | undefined
    act(() => {
      pending = result.current.ai.generate("userStory")
    })
    await waitFor(() => expect(result.current.ai.generating).toBe("userStory"))
    // A different field is ignored while one is running.
    await act(() => result.current.ai.generate("acceptanceCriteria"))
    await act(async () => {
      await result.current.ai.generate("userStory")
      await pending
    })
    expect(result.current.ai.generating).toBeNull()
    expect(result.current.form.userStory).toBe("orig")
    expect(screen.queryByText(t.aiFailed)).not.toBeInTheDocument()
  })
})

describe("useDraftPrefill", () => {
  afterEach(() => {
    sessionStorage.clear()
    window.history.replaceState({}, "", "/")
  })

  it("does nothing without the fromAiDraft flag", () => {
    const onDraft = vi.fn()
    sessionStorage.setItem("kanflow:pbiDraft:p1", "{}")
    renderHook(() => useDraftPrefill("p1", onDraft))
    expect(onDraft).not.toHaveBeenCalled()
    expect(sessionStorage.getItem("kanflow:pbiDraft:p1")).toBe("{}")
  })

  it("consumes the draft once, sanitises fields and cleans the URL", () => {
    window.history.replaceState({}, "", "/projects/p1/backlog?fromAiDraft=1&x=2")
    sessionStorage.setItem(
      "kanflow:pbiDraft:p1",
      JSON.stringify({ initiative: "I", userStory: 42, workloadScore: 5, iceboxItemId: "ib1" }),
    )
    const onDraft = vi.fn()
    renderHook(() => useDraftPrefill("p1", onDraft))
    expect(onDraft).toHaveBeenCalledWith({
      initiative: "I",
      epic: "",
      userStory: "",
      acceptanceCriteria: "",
      workloadScore: 5,
      iceboxItemId: "ib1",
    })
    expect(sessionStorage.getItem("kanflow:pbiDraft:p1")).toBeNull()
    expect(window.location.search).toBe("?x=2")
  })

  it("ignores malformed or missing drafts", () => {
    const onDraft = vi.fn()
    window.history.replaceState({}, "", "/?fromAiDraft=1")
    sessionStorage.setItem("kanflow:pbiDraft:p1", "{not json")
    renderHook(() => useDraftPrefill("p1", onDraft))
    window.history.replaceState({}, "", "/?fromAiDraft=1")
    renderHook(() => useDraftPrefill("p2", onDraft))
    expect(onDraft).not.toHaveBeenCalled()
  })
})

describe("backlog type helpers", () => {
  it("matches queries across fields and display id", () => {
    const item = pbi("a", 42, { epic: "Payments", acceptanceCriteria: "Must PASS" })
    expect(matchesQuery(item, "")).toBe(true)
    expect(matchesQuery(item, "payments")).toBe(true)
    expect(matchesQuery(item, "pass")).toBe(true)
    expect(matchesQuery(item, "42")).toBe(true)
    expect(matchesQuery(pbi("b", 1, { initiative: null, userStory: null }), "zzz")).toBe(false)
  })
})
