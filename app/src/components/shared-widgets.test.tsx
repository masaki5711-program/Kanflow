import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { getTranslations } from "@/lib/i18n"
import { jsonResponse } from "./__tests__/helpers"

const auth = vi.hoisted(() => ({ status: "authenticated", signOut: vi.fn() }))
const nav = vi.hoisted(() => ({ pathname: "/projects/p1" }))

vi.mock("next-auth/react", () => ({
  SessionProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useSession: () => ({ data: null, status: auth.status }),
  signOut: (...a: unknown[]) => auth.signOut(...a),
}))
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }))
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

const { I18nText, PendingBadge, GlossaryHint, useI18nText } = await import("./i18n-text")
const { LiveAnnouncer, announce, resetAnnouncer } = await import("./live-announcer")
const { default: IdleLogoutWatcher } = await import("./idle-logout-watcher")
const { Providers } = await import("./providers")
const { ErrorView } = await import("./error-view")
const { HelpTooltip } = await import("./help-tooltip")
const { LanguageProvider } = await import("@/lib/language-context")
const { ToastProvider, useToast } = await import("@/components/ui/toast")

const ja = getTranslations("ja")
const en = getTranslations("en")

function Ja({ children }: { children: ReactNode }) {
  return (
    <LanguageProvider initialLanguage="ja">
      <ToastProvider>{children}</ToastProvider>
    </LanguageProvider>
  )
}

describe("I18nText", () => {
  it("shows the viewer-locale translation; the tooltip leads with the shown text and labels the original (A4-05)", () => {
    render(
      <Ja>
        <I18nText i18n={{ title: { source: "id", ja: "日本語", id: "Bahasa", status: "done" } as never }} field="title" original="Bahasa" />
      </Ja>,
    )
    expect(screen.getByText("日本語")).toHaveAttribute("title", `日本語
${ja.translationOriginalLabel}: Bahasa`)
  })

  it("renders the fallback (or nothing) when the text is empty", () => {
    const { container } = render(
      <Ja>
        <I18nText i18n={null} field="x" original="" />
      </Ja>,
    )
    expect(container.textContent).toBe("")
    render(
      <Ja>
        <I18nText i18n={null} field="x" original={null} fallback={<em>none</em>} />
      </Ja>,
    )
    expect(screen.getByText("none")).toBeInTheDocument()
  })

  it("shows a pending badge that can translate now and reports success", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ ok: true })))
    vi.stubGlobal("fetch", fetchMock)
    render(
      <Ja>
        <I18nText
          as="p"
          i18n={{ title: { source: "id", ja: null, id: "Halo", status: "pending" } as never }}
          field="title"
          original="Halo"
          entity={{ type: "backlog_item", id: "b1" }}
        />
      </Ja>,
    )
    const badge = screen.getByRole("button", { name: ja.translationPending })
    await userEvent.click(badge)
    await waitFor(() => expect(screen.getByText(ja.translationDone)).toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalledWith("/api/ai/translate", expect.objectContaining({ method: "POST" }))
    vi.unstubAllGlobals()
  })

  it("hides the badge with noBadge and shows a static failed badge without entity", () => {
    const i18n = { title: { source: "id", ja: null, id: "Halo", status: "failed" } as never }
    const { unmount } = render(
      <Ja>
        <I18nText i18n={i18n} field="title" original="Halo" noBadge />
      </Ja>,
    )
    expect(screen.queryByText(ja.translationFailed)).not.toBeInTheDocument()
    unmount()
    render(
      <Ja>
        <I18nText i18n={i18n} field="title" original="Halo" />
      </Ja>,
    )
    const badge = screen.getByText(ja.translationFailed)
    expect(badge).not.toHaveAttribute("role")
  })

  it("marks untranslated text with its source language", () => {
    render(
      <Ja>
        <I18nText i18n={{ title: { source: "id", ja: null, id: "Halo", status: "pending" } as never }} field="title" original="Halo" noBadge />
      </Ja>,
    )
    expect(screen.getByText("Halo")).toHaveAttribute("lang", "id")
  })

  it("does not set lang when the text is already in the UI language", () => {
    render(
      <Ja>
        <I18nText i18n={{ title: { source: "ja", ja: "日本", id: null, status: "pending" } as never }} field="title" original="日本" />
      </Ja>,
    )
    expect(screen.getByText("日本")).not.toHaveAttribute("lang")
  })

  it("reveals the original with a keyboard-reachable toggle", async () => {
    render(
      <Ja>
        <I18nText i18n={{ title: { source: "id", ja: "日本語", id: "Bahasa", status: "done" } as never }} field="title" original="Bahasa" />
      </Ja>,
    )
    const toggle = screen.getByRole("button", { name: ja.translationOriginalLabel })
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    toggle.focus()
    await userEvent.keyboard("{Enter}")
    expect(toggle).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByText("Bahasa")).toHaveAttribute("lang", "id")
    await userEvent.click(toggle)
    expect(screen.queryByText("Bahasa")).not.toBeInTheDocument()
  })

  it("offers no toggle inside a link (tooltip only)", () => {
    render(
      <Ja>
        <a href="/x">
          <I18nText i18n={{ title: { source: "id", ja: "日本語", id: "Bahasa", status: "done" } as never }} field="title" original="Bahasa" />
        </a>
      </Ja>,
    )
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })

  it("useI18nText returns the picked text", () => {
    function Probe() {
      return <output>{useI18nText(undefined, "name", "Plain").text}</output>
    }
    render(<Probe />)
    expect(screen.getByRole("status")).toHaveTextContent("Plain")
  })
})

describe("PendingBadge", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("activates with Enter, shows an error toast on failure and calls nothing else", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse({ error: "quota" }, 500))))
    const onDone = vi.fn()
    render(
      <Ja>
        <PendingBadge entity={{ type: "sprint", id: "s1" }} field="goal" onDone={onDone} />
      </Ja>,
    )
    const badge = screen.getByRole("button", { name: ja.translationPending })
    badge.focus()
    await userEvent.keyboard("{Enter}")
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("quota"))
    expect(screen.getAllByText(ja.translationFailed).length).toBeGreaterThan(0)
    expect(onDone).not.toHaveBeenCalled()
  })

  it("calls onDone after a successful translate triggered by Space", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse({}))))
    const onDone = vi.fn()
    render(
      <Ja>
        <PendingBadge entity={{ type: "sprint", id: "s1" }} field="goal" onDone={onDone} />
      </Ja>,
    )
    const badge = screen.getByRole("button")
    badge.focus()
    await userEvent.keyboard(" ")
    await waitFor(() => expect(onDone).toHaveBeenCalled())
  })

  it("is plain status text (no nested control) inside a link", () => {
    render(
      <Ja>
        <a href="/x">
          Title
          <PendingBadge entity={{ type: "sprint", id: "s1" }} field="goal" />
        </a>
      </Ja>,
    )
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
    expect(screen.getByText(ja.translationPending)).toBeInTheDocument()
  })

  it("announces progress through the single shared live region", async () => {
    resetAnnouncer()
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse({}))))
    render(
      <Ja>
        <LiveAnnouncer />
        <PendingBadge entity={{ type: "sprint", id: "s1" }} field="goal" />
        <PendingBadge entity={{ type: "sprint", id: "s2" }} field="goal" />
      </Ja>,
    )
    // ToastProvider's own regions aside, the badges add no live regions of their own.
    const before = document.querySelectorAll("[aria-live]").length
    await userEvent.click(screen.getAllByRole("button")[0])
    await waitFor(() => expect(screen.getByTestId("live-announcer")).toHaveTextContent(ja.translationDone))
    expect(document.querySelectorAll("[aria-live]").length).toBe(before)
    act(() => announce(ja.translationDone))
    expect(screen.getByTestId("live-announcer")).toHaveTextContent(ja.translationDone)
  })

  it("GlossaryHint renders the localized hint", () => {
    render(
      <Ja>
        <GlossaryHint className="x" />
      </Ja>,
    )
    expect(screen.getByText(ja.glossaryHint)).toHaveAttribute("title", ja.glossaryHintTitle)
  })
})

describe("IdleLogoutWatcher", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    auth.status = "authenticated"
    nav.pathname = "/projects/p1"
    auth.signOut.mockClear()
    // Node's experimental global localStorage can shadow jsdom's; use an in-memory stub.
    const store = new Map<string, string>()
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  const TWO_HOURS = 2 * 60 * 60 * 1000

  it("signs out after two hours without activity", () => {
    const { unmount } = render(<IdleLogoutWatcher />)
    act(() => {
      vi.advanceTimersByTime(TWO_HOURS + 30_000)
    })
    expect(auth.signOut).toHaveBeenCalledWith({ callbackUrl: "/login?reason=idle", redirect: true })
    unmount()
  })

  it("user input keeps the session alive", () => {
    const { unmount } = render(<IdleLogoutWatcher />)
    act(() => {
      vi.advanceTimersByTime(TWO_HOURS - 60_000)
    })
    act(() => {
      window.dispatchEvent(new Event("keydown"))
    })
    act(() => {
      vi.advanceTimersByTime(90_000)
    })
    expect(auth.signOut).not.toHaveBeenCalled()
    unmount()
  })

  it("activity in another tab (storage event) keeps this tab alive", () => {
    const { unmount } = render(<IdleLogoutWatcher />)
    act(() => {
      vi.advanceTimersByTime(TWO_HOURS - 60_000)
    })
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "other", newValue: "1" }))
      window.dispatchEvent(new StorageEvent("storage", { key: "kanflow:lastActiveAt", newValue: String(Date.now()) }))
    })
    window.localStorage.removeItem("kanflow:lastActiveAt")
    act(() => {
      vi.advanceTimersByTime(90_000)
    })
    expect(auth.signOut).not.toHaveBeenCalled()
    unmount()
  })

  it("does nothing when signed out or on the login page", () => {
    auth.status = "unauthenticated"
    const { unmount } = render(<IdleLogoutWatcher />)
    unmount()
    auth.status = "authenticated"
    nav.pathname = "/login"
    const r = render(<IdleLogoutWatcher />)
    act(() => {
      vi.advanceTimersByTime(TWO_HOURS * 2)
    })
    expect(auth.signOut).not.toHaveBeenCalled()
    r.unmount()
  })
})

describe("Providers", () => {
  it("wires language, toast and confirm providers around children", () => {
    function Child() {
      useToast()
      return <span>child ok</span>
    }
    auth.status = "unauthenticated"
    render(
      <Providers userLanguage="en">
        <Child />
      </Providers>,
    )
    expect(screen.getByText("child ok")).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Notifications" })).toBeInTheDocument()
  })
})

describe("ErrorView", () => {
  it("shows the error message, retries and optionally links home", async () => {
    const reset = vi.fn()
    render(
      <LanguageProvider initialLanguage="en">
        <ErrorView error={new Error("DB down")} reset={reset} showHomeLink />
      </LanguageProvider>,
    )
    expect(screen.getByRole("heading", { name: en.errorPageTitle })).toBeInTheDocument()
    expect(screen.getByRole("alert")).toHaveTextContent("DB down")
    await userEvent.click(screen.getByRole("button", { name: en.errorRetry }))
    expect(reset).toHaveBeenCalled()
    expect(screen.getByRole("link", { name: en.errorGoHome })).toHaveAttribute("href", "/")
  })

  it("falls back to the generic message", () => {
    render(
      <LanguageProvider initialLanguage="en">
        <ErrorView error={new Error("")} reset={() => {}} />
      </LanguageProvider>,
    )
    expect(screen.getByRole("alert")).toHaveTextContent(en.errorPageMessage)
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
  })
})

describe("HelpTooltip", () => {
  it.each(["top", "bottom", "left", "right"] as const)("shows on focus and hides on Escape (%s)", async (side) => {
    render(
      <LanguageProvider initialLanguage="en">
        <HelpTooltip content="Helpful text" side={side} />
      </LanguageProvider>,
    )
    const trigger = screen.getByRole("button", { name: en.helpTooltipLabel })
    await userEvent.tab()
    expect(trigger).toHaveFocus()
    const tip = screen.getByRole("tooltip")
    expect(trigger).toHaveAttribute("aria-describedby", tip.id)
    await userEvent.keyboard("{Escape}")
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
  })

  it("toggles on click and hover", async () => {
    render(
      <LanguageProvider initialLanguage="en">
        <HelpTooltip content="Tip" ariaLabel="More info" />
      </LanguageProvider>,
    )
    const trigger = screen.getByRole("button", { name: "More info" })
    fireEvent.mouseEnter(trigger)
    expect(screen.getByRole("tooltip")).toHaveTextContent("Tip")
    fireEvent.mouseLeave(trigger)
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
    fireEvent.click(trigger)
    expect(screen.getByRole("tooltip")).toBeInTheDocument()
    fireEvent.blur(trigger)
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
  })
})
