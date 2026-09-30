import { describe, expect, it } from "vitest"
import { FAQ_ENTRIES, FAQ_CATEGORY_LABELS, FAQ_CATEGORY_COLORS } from "./faq-data"
import { GLOSSARY_ENTRIES, CATEGORY_LABELS, CATEGORY_COLORS } from "./glossary-data"
import { getSteps } from "./guide-steps"
import { getProjectTypeLabels, type ProjectType } from "@/lib/project-type-labels"
import type { Language } from "@/lib/i18n"

const LANGS: Language[] = ["ja", "en", "id"]
const TYPES: ProjectType[] = ["software", "process_improvement", "general"]
const filled = (v: unknown) => typeof v === "string" && v.trim().length > 0

describe("guide data integrity", () => {
  it("every FAQ entry has question/answer in all languages and a known category", () => {
    expect(FAQ_ENTRIES.length).toBeGreaterThan(0)
    for (const f of FAQ_ENTRIES) {
      for (const l of LANGS) {
        expect(filled(f.question[l]), `${f.question.ja} [${l}]`).toBe(true)
        expect(filled(f.answer[l]), `${f.question.ja} answer [${l}]`).toBe(true)
      }
      expect(FAQ_CATEGORY_LABELS[f.category]).toBeDefined()
      expect(FAQ_CATEGORY_COLORS[f.category]).toBeDefined()
    }
  })

  it("every glossary entry has term/description (and kanflow note if present) in all languages", () => {
    expect(GLOSSARY_ENTRIES.length).toBeGreaterThan(0)
    for (const g of GLOSSARY_ENTRIES) {
      expect(filled(g.english)).toBe(true)
      for (const l of LANGS) {
        expect(filled(g.term[l]), `${g.english} term [${l}]`).toBe(true)
        expect(filled(g.description[l]), `${g.english} desc [${l}]`).toBe(true)
        if (g.kanflow) expect(filled(g.kanflow[l]), `${g.english} kanflow [${l}]`).toBe(true)
      }
      expect(CATEGORY_LABELS[g.category]).toBeDefined()
      expect(CATEGORY_COLORS[g.category]).toBeDefined()
    }
  })

  it("category labels are translated for all languages", () => {
    for (const labels of [...Object.values(FAQ_CATEGORY_LABELS), ...Object.values(CATEGORY_LABELS)]) {
      for (const l of LANGS) expect(filled(labels[l])).toBe(true)
    }
  })

  it.each(TYPES)("getSteps(%s) yields the same number of steps per language with stable ids", (type) => {
    const counts = LANGS.map((l) => {
      const steps = getSteps(type, getProjectTypeLabels(type, l), l)
      steps.forEach((s, i) => {
        expect(s.id).toBe(`step-${i}`)
        expect(filled(s.title)).toBe(true)
        expect(filled(s.description)).toBe(true)
        expect(s.icon).toBeTruthy()
        expect(s.color).toMatch(/^bg-/)
      })
      return steps.length
    })
    expect(new Set(counts).size).toBe(1)
    expect(counts[0]).toBeGreaterThan(0)
  })
})
