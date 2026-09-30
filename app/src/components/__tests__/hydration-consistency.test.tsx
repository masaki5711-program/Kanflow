import { afterEach, describe, expect, it, vi } from "vitest"
import { act, type ReactElement } from "react"
import { renderToString } from "react-dom/server"
import { hydrateRoot, type Root } from "react-dom/client"
import { useSession } from "next-auth/react"
import type { Session } from "next-auth"
import { Providers } from "@/components/providers"
import { LanguageProvider, ProjectTypeScope, useLanguage } from "@/lib/language-context"
import { getProjectTypeLabels } from "@/lib/project-type-labels"

/**
 * C3-01: server HTML and the client's hydration render must agree. These
 * tests render to a string (the "server"), then hydrate that HTML and fail on
 * any recoverable hydration error React reports (#418 in production).
 */
vi.mock("@/components/idle-logout-watcher", () => ({ default: () => null }))

const SESSION: Session = { user: { id: "u1", name: "Dewi", email: "dewi@example.test", role: "member" }, expires: "2099-01-01T00:00:00.000Z" }

let root: Root | null = null
afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ""
  vi.unstubAllGlobals()
})

async function hydrate(ui: ReactElement): Promise<{ html: string; errors: unknown[]; container: HTMLElement }> {
  const html = renderToString(ui)
  const container = document.createElement("div")
  container.innerHTML = html
  document.body.appendChild(container)
  const errors: unknown[] = []
  await act(async () => {
    root = hydrateRoot(container, ui, { onRecoverableError: (e) => errors.push(e) })
  })
  return { html, errors, container }
}

function SessionProbe() {
  const { data, status } = useSession()
  // Structural difference on purpose: signed-in markup has an extra element (like the header nav).
  return data?.user ? <nav data-testid="nav">{data.user.name}</nav> : <span data-status={status} />
}

describe("session is identical on the server and in hydration (C3-01)", () => {
  it("renders the signed-in markup in the server HTML and hydrates it without a mismatch or a session fetch", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => new Response("{}", { headers: { "content-type": "application/json" } }))
    vi.stubGlobal("fetch", fetchMock)

    const { html, errors, container } = await hydrate(
      <Providers session={SESSION}>
        <SessionProbe />
      </Providers>,
    )

    expect(html).toContain('data-testid="nav"')
    expect(html).toContain("Dewi")
    expect(errors).toEqual([])
    expect(container.querySelector('[data-testid="nav"]')).toHaveTextContent("Dewi")
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/auth/session"))).toHaveLength(0)
  })

  it("treats a signed-out server session (null) as unauthenticated from the first render", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("null", { headers: { "content-type": "application/json" } })))
    const { html, errors } = await hydrate(
      <Providers session={null}>
        <SessionProbe />
      </Providers>,
    )
    expect(html).toContain('data-status="unauthenticated"')
    expect(errors).toEqual([])
  })
})

function LabelProbe() {
  const { pt, projectType } = useLanguage()
  return (
    <p data-type={projectType}>
      {projectType === "process_improvement" ? <strong>{pt.navBacklog}</strong> : <span>{pt.navBacklog}</span>}
    </p>
  )
}

describe("project-type labels come from the server value (C3-01)", () => {
  it("server HTML already carries the project's labels and hydrates without a mismatch", async () => {
    const ui = (
      <LanguageProvider initialLanguage="ja">
        <ProjectTypeScope projectType="process_improvement">
          <LabelProbe />
        </ProjectTypeScope>
      </LanguageProvider>
    )
    const { html, errors } = await hydrate(ui)
    expect(html).toContain(getProjectTypeLabels("process_improvement", "ja").navBacklog)
    expect(html).toContain("<strong>")
    expect(errors).toEqual([])
  })

  it("setProjectType (settings page) switches the scope's labels until the server prop changes", async () => {
    function Setter() {
      const { setProjectType } = useLanguage()
      return <button type="button" onClick={() => setProjectType("general")}>set</button>
    }
    const ui = (projectType: "software" | "process_improvement") => (
      <LanguageProvider initialLanguage="en">
        <ProjectTypeScope projectType={projectType}>
          <Setter />
          <LabelProbe />
        </ProjectTypeScope>
      </LanguageProvider>
    )
    const { container } = await hydrate(ui("software"))
    await act(async () => container.querySelector("button")?.click())
    expect(container.querySelector("p")).toHaveAttribute("data-type", "general")
    expect(container).toHaveTextContent(getProjectTypeLabels("general", "en").navBacklog)

    await act(async () => root?.render(ui("process_improvement")))
    expect(container.querySelector("p")).toHaveAttribute("data-type", "process_improvement")
  })
})
