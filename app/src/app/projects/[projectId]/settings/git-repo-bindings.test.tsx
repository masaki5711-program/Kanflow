import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { getTranslations } from "@/lib/i18n"
import { jsonResponse, renderWithProviders } from "@/components/__tests__/helpers"
import { GitRepoBindings, toRepoBindings } from "./git-repo-bindings"

/** X3 GitStation のリポジトリの結びつけ in the settings: list, search, bind / unbind through the confirmation. */
const en = getTranslations("en")
const CONFIRM = `https://gitstation.example/-/confirm/projects/31/integration-bindings?intent=binding_set&integration=7&kanflow_project_id=p1&resolves_work_items=true&state=${"s".repeat(43)}`

let bindingsBody: unknown
let completeAnswers: Array<[number, unknown]>
let searchBody: unknown
const calls: string[] = []
const binding = (over: Record<string, unknown> = {}) => ({ bindingId: 100, repositoryId: 32, path: "specs/zeva", resolvesWorkItems: false, listed: false, url: "https://gitstation.example/specs/zeva", ...over })

beforeEach(() => {
  calls.length = 0
  bindingsBody = { supported: true, canAct: true, items: [binding()] }
  searchBody = { items: [{ id: 31, path: "app/portal", displayName: "Portal", binding: null }, { id: 32, path: "specs/zeva", displayName: "specs/zeva", binding: null }] }
  completeAnswers = [[200, { outcome: "bound", binding: null }]]
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url)
      calls.push(`${init?.method ?? "GET"} ${u}${typeof init?.body === "string" ? ` ${init.body}` : ""}`)
      if (u.includes("/repo-bindings/start")) return jsonResponse({ attemptId: "att-1", confirmUrl: CONFIRM, expiresAt: "2026-11-10T00:10:00Z" }, 201)
      if (u.includes("/complete")) {
        const [status, body] = completeAnswers.shift() ?? [409, { error: "x", code: "GIT_APPROVAL_RETRY" }]
        return jsonResponse(body, status)
      }
      if (u.includes("/repo-bindings/search")) return jsonResponse(searchBody)
      if (u.includes("/repo-bindings")) return jsonResponse(bindingsBody)
      if (u.includes("/git/repositories")) return jsonResponse({ id: "r1" }, 201)
      return jsonResponse({}, 404)
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())

const onRepositoriesChanged = vi.fn()
const render = (canBind = true) => renderWithProviders(<GitRepoBindings projectId="p1" canBind={canBind} onRepositoriesChanged={onRepositoriesChanged} />, "en")
const posts = (part: string) => calls.filter((c) => c.startsWith("POST") && c.includes(part))

describe("GitStation repository bindings in the settings (X3)", () => {
  it("lists the bindings with their kind; search, bind as code through GitStation's confirmation, then 確認しました", async () => {
    const user = userEvent.setup()
    render()
    const list = await screen.findByRole("list")
    expect(within(list).getByText("specs/zeva")).toBeInTheDocument()
    expect(within(list).getByText(en.gitBindKindShared)).toBeInTheDocument()

    await user.type(screen.getByLabelText(en.gitBindSearchLabel), "portal")
    await user.click(screen.getByRole("button", { name: en.gitBindSearch }))
    expect(await screen.findByText(en.gitBindSearchFound.replace("{count}", "2"))).toBeInTheDocument()
    expect(calls).toContain("GET /api/projects/p1/git/repo-bindings/search?q=portal")
    // Already bound here: no bind buttons, its kind instead.
    expect(screen.getByText(en.gitBindAlready.replace("{kind}", en.gitBindKindShared))).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: en.gitBindAsCodeLabel.replace("{path}", "specs/zeva") })).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: en.gitBindAsCodeLabel.replace("{path}", "app/portal") }))
    const group = await screen.findByRole("group", { name: en.gitBindConfirmGroup.replace("{path}", "app/portal") })
    const open = within(group).getByRole("link", { name: `${en.gitDevConfirmOpen} ${en.gitDevConfirmNewWindow}` })
    expect(open).toHaveAttribute("href", CONFIRM)
    expect(open).toHaveAttribute("target", "_blank")
    expect(open.getAttribute("rel")).toContain("noopener")
    await waitFor(() => expect(open).toHaveFocus())
    expect(posts("/start")).toEqual([`POST /api/projects/p1/git/repo-bindings/start ${JSON.stringify({ intent: "binding_set", repositoryId: 31, resolvesWorkItems: true })}`])

    await user.click(within(group).getByRole("button", { name: en.gitDevConfirmDone }))
    expect(await screen.findByText(en.gitBindBound)).toBeInTheDocument()
    expect(screen.queryByRole("group", { name: en.gitBindConfirmGroup.replace("{path}", "app/portal") })).not.toBeInTheDocument()
    expect(posts("/complete")).toEqual(["POST /api/projects/p1/git/repo-bindings/att-1/complete"])
  })

  it("keeps the confirmation open and says why while GitStation has not been confirmed yet", async () => {
    const user = userEvent.setup()
    completeAnswers = [[409, { error: "x", code: "GIT_APPROVAL_NOT_CONFIRMED" }], [200, { outcome: "removed", binding: null }]]
    render()
    await user.click(await screen.findByRole("button", { name: en.gitBindUnbindLabel.replace("{path}", "specs/zeva") }))
    const group = await screen.findByRole("group", { name: en.gitBindConfirmGroup.replace("{path}", "specs/zeva") })
    expect(posts("/start")[0]).toContain(JSON.stringify({ intent: "binding_remove", bindingId: 100 }))
    await user.click(within(group).getByRole("button", { name: en.gitDevConfirmDone }))
    expect(await within(group).findByText(en.apiErrGitApprovalNotConfirmed)).toBeInTheDocument()
    await user.click(within(group).getByRole("button", { name: en.gitDevConfirmDone }))
    expect(await screen.findByText(en.gitBindRemoved)).toBeInTheDocument()
  })

  it("offers to change a shared spec repository to code, and to add a code repository to the read list", async () => {
    const user = userEvent.setup()
    bindingsBody = { supported: true, canAct: true, items: [binding(), binding({ bindingId: 101, repositoryId: 31, path: "app/portal", resolvesWorkItems: true, url: "https://gitstation.example/app/portal" })] }
    render()
    await user.click(await screen.findByRole("button", { name: en.gitBindAddToListLabel.replace("{path}", "app/portal") }))
    await waitFor(() => expect(posts("/git/repositories")).toEqual([`POST /api/projects/p1/git/repositories ${JSON.stringify({ name: "app/portal", url: "https://gitstation.example/app/portal" })}`]))
    expect(onRepositoriesChanged).toHaveBeenCalled()
    // Only a code repository is offered for the read list; the shared one can become code.
    expect(screen.queryByRole("button", { name: en.gitBindAddToListLabel.replace("{path}", "specs/zeva") })).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: en.gitBindMakeCodeLabel.replace("{path}", "specs/zeva") }))
    await screen.findByRole("group", { name: en.gitBindConfirmGroup.replace("{path}", "specs/zeva") })
    expect(posts("/start")[0]).toContain(JSON.stringify({ intent: "binding_set", repositoryId: 32, resolvesWorkItems: true }))
  })

  it("without an employee number: the list and the reason, no search and no buttons", async () => {
    bindingsBody = { supported: true, canAct: false, items: [binding()] }
    render()
    expect(await screen.findByText(en.gitBindNoEmployeeNumber)).toBeInTheDocument()
    expect(screen.queryByLabelText(en.gitBindSearchLabel)).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: en.gitBindUnbindLabel.replace("{path}", "specs/zeva") })).not.toBeInTheDocument()
  })

  it("shows nothing (and reads nothing) for people who may not bind, and nothing for a non-GitStation project", async () => {
    render(false)
    expect(screen.queryByText(en.gitBindTitle)).not.toBeInTheDocument()
    expect(calls).toEqual([])
    expect(toRepoBindings({ supported: false, reason: "provider" })).toEqual({ supported: false, reason: "provider" })
    expect(toRepoBindings({ supported: true, items: [{ bindingId: "x" }] })).toEqual({ supported: true, canAct: false, items: [] })
  })
})
