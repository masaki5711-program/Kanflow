"use client"

import { useRef, useState, type KeyboardEvent } from "react"
import { useLanguage } from "@/lib/language-context"
import { cn, PageHeader } from "@/components/ui"
import { BookOpen } from "lucide-react"
import { GettingStartedTab } from "./getting-started-tab"
import { GlossaryTab } from "./glossary-tab"
import { HelpTab } from "./help-tab"
import { useProjectDocumentTitle } from "@/components/app-shell/project-title-context"

type Tab = "getting-started" | "glossary" | "help"
type TabLabelKey = "guideTabGettingStarted" | "guideTabGlossary" | "guideTabHelp"

const TABS: readonly { key: Tab; label: TabLabelKey }[] = [
  { key: "getting-started", label: "guideTabGettingStarted" },
  { key: "glossary", label: "guideTabGlossary" },
  { key: "help", label: "guideTabHelp" },
]

const tabId = (key: Tab) => `guide-tab-${key}`
const panelId = (key: Tab) => `guide-panel-${key}`

export default function GuidePage() {
  const { t } = useLanguage()
  useProjectDocumentTitle(t.guideTitle)
  const [activeTab, setActiveTab] = useState<Tab>("getting-started")
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({})

  // WAI-ARIA tabs pattern: arrow keys / Home / End move between tabs.
  const onTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const idx = TABS.findIndex((tab) => tab.key === activeTab)
    let next = -1
    if (e.key === "ArrowRight") next = (idx + 1) % TABS.length
    else if (e.key === "ArrowLeft") next = (idx - 1 + TABS.length) % TABS.length
    else if (e.key === "Home") next = 0
    else if (e.key === "End") next = TABS.length - 1
    if (next < 0) return
    e.preventDefault()
    const key = TABS[next].key
    setActiveTab(key)
    tabRefs.current[key]?.focus()
  }

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <PageHeader
        className="mb-0 shrink-0 px-6 py-4 border-b border-border bg-surface"
        title={t.guideTitle}
        icon={
          <span className="w-8 h-8 rounded-ui-sm bg-primary-soft flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-primary-strong" />
          </span>
        }
        actions={
          <>
            {/* Tab bar — segment control */}
            <div
              role="tablist"
              aria-label={t.guideTabsLabel}
              className="flex items-center rounded-lg border border-slate-200 overflow-hidden text-caption font-medium"
            >
              {TABS.map(({ key, label }) => {
                const selected = activeTab === key
                return (
                  <button
                    key={key}
                    ref={(el) => {
                      tabRefs.current[key] = el
                    }}
                    type="button"
                    role="tab"
                    id={tabId(key)}
                    aria-selected={selected}
                    aria-controls={panelId(key)}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => setActiveTab(key)}
                    onKeyDown={onTabKeyDown}
                    className={cn(
                      "px-4 py-1.5 min-h-8 transition-colors",
                      selected ? "bg-primary text-primary-fg" : "bg-white text-slate-700 hover:bg-slate-50",
                    )}
                  >
                    {t[label]}
                  </button>
                )
              })}
            </div>
          </>
        }
      />

      <div className="flex-1 overflow-y-auto p-6">
        <div
          role="tabpanel"
          id={panelId(activeTab)}
          aria-labelledby={tabId(activeTab)}
          className="max-w-4xl mx-auto"
        >
          {activeTab === "getting-started" && <GettingStartedTab />}
          {activeTab === "glossary" && <GlossaryTab />}
          {activeTab === "help" && <HelpTab />}
        </div>
      </div>
    </div>
  )
}
