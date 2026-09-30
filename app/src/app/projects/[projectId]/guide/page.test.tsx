import { describe, expect, it } from "vitest"
import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { getTranslations } from "@/lib/i18n"
import { renderWithProviders } from "../settings/__tests__/providers"
import GuidePage from "./page"
import { GLOSSARY_ENTRIES, CATEGORY_LABELS } from "./glossary-data"
import { FAQ_ENTRIES, FAQ_CATEGORY_LABELS } from "./faq-data"
import { SOFTWARE_STEPS } from "./steps-software"

const t = getTranslations("ja")

function esc(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function countStatus() {
  return document.querySelector("p[role=status][aria-live=polite]") as HTMLElement
}

function tabs() {
  return {
    start: screen.getByRole("tab", { name: t.guideTabGettingStarted }),
    glossary: screen.getByRole("tab", { name: t.guideTabGlossary }),
    help: screen.getByRole("tab", { name: t.guideTabHelp }),
  }
}

describe("GuidePage tabs", () => {
  it("starts on getting-started with roving tabindex and linked tabpanel", () => {
    renderWithProviders(<GuidePage />)
    const { start, glossary, help } = tabs()
    expect(screen.getByRole("tablist", { name: t.guideTabsLabel })).toBeInTheDocument()
    expect(start).toHaveAttribute("aria-selected", "true")
    expect(start).toHaveAttribute("tabindex", "0")
    expect(glossary).toHaveAttribute("tabindex", "-1")
    expect(help).toHaveAttribute("aria-selected", "false")
    const panel = screen.getByRole("tabpanel")
    expect(panel).toHaveAttribute("aria-labelledby", start.id)
    expect(start).toHaveAttribute("aria-controls", panel.id)
  })

  it("ArrowRight / ArrowLeft wrap around and move focus + selection", async () => {
    const user = userEvent.setup()
    renderWithProviders(<GuidePage />)
    const { start, glossary, help } = tabs()
    start.focus()

    await user.keyboard("{ArrowRight}")
    expect(glossary).toHaveFocus()
    expect(glossary).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("tabpanel")).toHaveAttribute("id", "guide-panel-glossary")

    await user.keyboard("{ArrowRight}")
    expect(help).toHaveFocus()
    await user.keyboard("{ArrowRight}")
    expect(start).toHaveFocus()
    expect(start).toHaveAttribute("aria-selected", "true")

    await user.keyboard("{ArrowLeft}")
    expect(help).toHaveFocus()
    expect(help).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("tabpanel")).toHaveAttribute("id", "guide-panel-help")
  })

  it("Home / End jump to first and last tab; other keys are ignored", async () => {
    const user = userEvent.setup()
    renderWithProviders(<GuidePage />)
    const { start, help } = tabs()
    start.focus()
    await user.keyboard("{End}")
    expect(help).toHaveFocus()
    expect(help).toHaveAttribute("aria-selected", "true")
    await user.keyboard("{Home}")
    expect(start).toHaveFocus()
    expect(start).toHaveAttribute("aria-selected", "true")
    await user.keyboard("a")
    expect(start).toHaveAttribute("aria-selected", "true")
  })

  it("clicking a tab switches the panel content", async () => {
    const user = userEvent.setup()
    renderWithProviders(<GuidePage />)
    await user.click(tabs().help)
    expect(screen.getByText(FAQ_ENTRIES[0].question.ja)).toBeInTheDocument()
    await user.click(tabs().glossary)
    expect(screen.getByRole("searchbox")).toBeInTheDocument()
  })
})

describe("GettingStartedTab", () => {
  it("shows the scrum diagram for software, first step open, toggles steps", async () => {
    const user = userEvent.setup()
    const { container } = renderWithProviders(<GuidePage />)
    expect(screen.getByText(t.guideIntroSoftware)).toBeInTheDocument()
    expect(container.querySelector("svg")).not.toBeNull()

    const first = screen.getByRole("button", { name: new RegExp(esc(SOFTWARE_STEPS.ja[0].title)) })
    const second = screen.getByRole("button", { name: new RegExp(esc(SOFTWARE_STEPS.ja[1].title)) })
    expect(first).toHaveAttribute("aria-expanded", "true")
    expect(second).toHaveAttribute("aria-expanded", "false")
    const panel = document.getElementById(second.getAttribute("aria-controls") as string) as HTMLElement
    expect(panel).toHaveAttribute("aria-hidden", "true")

    await user.click(second)
    expect(second).toHaveAttribute("aria-expanded", "true")
    expect(panel).toHaveAttribute("aria-hidden", "false")
    await user.click(first)
    expect(first).toHaveAttribute("aria-expanded", "false")
  })

  it("number badge also toggles its step", async () => {
    const user = userEvent.setup()
    const { container } = renderWithProviders(<GuidePage />)
    const badge = container.querySelector('button[aria-hidden="true"]') as HTMLButtonElement
    const header = screen.getByRole("button", { name: new RegExp(esc(SOFTWARE_STEPS.ja[0].title)) })
    await user.click(badge)
    expect(header).toHaveAttribute("aria-expanded", "false")
  })

  it.each([
    ["process_improvement", "guideIntroProcessImprovement"],
    ["general", "guideIntroGeneral"],
  ] as const)("renders intro for %s projects with only the first step expanded", (projectType, key) => {
    renderWithProviders(<GuidePage />, { projectType, language: "en" })
    const en = getTranslations("en")
    expect(screen.getByText(en[key])).toBeInTheDocument()
    expect(screen.getAllByRole("button", { expanded: true })).toHaveLength(1)
  })

  it("renders the page (and scrum overview diagram) in en and id", () => {
    for (const language of ["en", "id"] as const) {
      const { unmount } = renderWithProviders(<GuidePage />, { language })
      expect(
        screen.getByRole("heading", { level: 1, name: getTranslations(language).guideTitle }),
      ).toBeInTheDocument()
      unmount()
    }
  })
})

describe("GlossaryTab", () => {
  const visibleFor = (type: string) =>
    GLOSSARY_ENTRIES.filter((e) => !e.projectTypes || e.projectTypes.includes(type as never))

  async function openGlossary() {
    const user = userEvent.setup()
    renderWithProviders(<GuidePage />)
    await user.click(screen.getByRole("tab", { name: t.guideTabGlossary }))
    return user
  }

  it("filters by search text and announces the count", async () => {
    const user = await openGlossary()
    const visible = visibleFor("software")
    expect(countStatus()).toHaveTextContent(
      t.guideResultsCount.replace("{count}", String(visible.length)),
    )
    const target = visible[0]
    await user.type(screen.getByRole("searchbox"), target.english)
    expect(screen.getByRole("heading", { name: target.term.ja })).toBeInTheDocument()
  })

  it("shows singular label for exactly one match and empty state for none", async () => {
    const user = await openGlossary()
    const box = screen.getByRole("searchbox")
    const visible = visibleFor("software")
    const matches = (q: string) =>
      visible.filter(
        (o) =>
          o.term.ja.toLowerCase().includes(q) ||
          o.english.toLowerCase().includes(q) ||
          o.description.ja.toLowerCase().includes(q),
      ).length
    const unique = visible.find((e) => matches(e.english.toLowerCase()) === 1)
    expect(unique).toBeDefined()
    await user.type(box, unique!.english)
    expect(countStatus()).toHaveTextContent(t.guideResultsCountOne)

    await user.clear(box)
    await user.type(box, "zzzz-no-such-term")
    expect(screen.getByText(t.guideNoResults)).toBeInTheDocument()
  })

  it("category pills filter entries and reflect aria-pressed", async () => {
    const user = await openGlossary()
    const group = screen.getByRole("group", { name: t.guideCategoryFilterLabel })
    const all = within(group).getByRole("button", { name: t.guideFilterAll })
    expect(all).toHaveAttribute("aria-pressed", "true")
    const role = within(group).getByRole("button", { name: CATEGORY_LABELS.role.ja })
    await user.click(role)
    expect(role).toHaveAttribute("aria-pressed", "true")
    expect(all).toHaveAttribute("aria-pressed", "false")
    const roleCount = visibleFor("software").filter((e) => e.category === "role").length
    expect(screen.getAllByRole("listitem")).toHaveLength(roleCount)
    await user.click(all)
    expect(all).toHaveAttribute("aria-pressed", "true")
  })
})

describe("HelpTab", () => {
  it("expands FAQ answers and filters by category", async () => {
    const user = userEvent.setup()
    renderWithProviders(<GuidePage />, { language: "en" })
    const en = getTranslations("en")
    await user.click(screen.getByRole("tab", { name: en.guideTabHelp }))

    const q = screen.getByRole("button", { name: new RegExp(esc(FAQ_ENTRIES[0].question.en)) })
    expect(q).toHaveAttribute("aria-expanded", "false")
    await user.click(q)
    expect(q).toHaveAttribute("aria-expanded", "true")
    const region = document.getElementById(q.getAttribute("aria-controls") as string) as HTMLElement
    expect(region).toHaveAttribute("aria-hidden", "false")
    await user.click(q)
    expect(q).toHaveAttribute("aria-expanded", "false")

    await user.click(screen.getByRole("button", { name: FAQ_CATEGORY_LABELS.sprint.en }))
    const sprintQs = FAQ_ENTRIES.filter(
      (f) => f.category === "sprint" && (!f.projectTypes || f.projectTypes.includes("software")),
    )
    expect(screen.getAllByRole("button", { expanded: false })).toHaveLength(sprintQs.length)
  })
})
