import { describe, expect, it } from "vitest"
import { baseScheduleSchema, planBaseSchedule } from "@/lib/plan-schedule/base-schedule"
import { scheduleFromTemplate, templateRoles } from "../from-template"

describe("scheduleFromTemplate (plan 12 E5)", () => {
  it("keeps stage keys, numbers the others in document order, turns links into dependsOn", () => {
    const s = scheduleFromTemplate({
      stages: [
        { name: "準備", children: [{ key: "spec", name: "仕様", durationDays: 5 }, { name: "見積", durationDays: 2 }] },
        { key: "build", name: "製作", durationDays: 10 },
        { name: "引き渡し", isMilestone: true },
      ],
      links: [{ from: "spec", to: "build" }],
    })
    expect(s).toEqual({
      items: [
        { key: "s1", name: "準備", children: [{ key: "spec", name: "仕様", durationDays: 5 }, { key: "s2", name: "見積", durationDays: 2 }] },
        { key: "build", name: "製作", durationDays: 10, dependsOn: ["spec"] },
        { key: "s3", name: "引き渡し", milestone: true },
      ],
    })
    // The result is a valid base schedule the loader can place.
    expect(baseScheduleSchema.safeParse(s).success).toBe(true)
    expect(planBaseSchedule(s, "2026-11-02").rows.find((r) => r.key === "build")?.plannedStart).toBe("2026-11-07")
  })

  it("a generated key never collides with a stage's own key, and the same template gives the same keys", () => {
    const content = { stages: [{ key: "s1", name: "A" }, { name: "B" }, { name: "C" }] }
    expect(scheduleFromTemplate(content).items.map((i) => i.key)).toEqual(["s1", "s2", "s3"])
    expect(scheduleFromTemplate(content)).toEqual(scheduleFromTemplate(content))
  })

  it("an invalid stage key is replaced, and a link to it is dropped", () => {
    const s = scheduleFromTemplate({ stages: [{ key: "bad key!", name: "A" }, { key: "b", name: "B" }], links: [{ from: "bad key!", to: "b" }] })
    expect(s.items).toEqual([{ key: "s1", name: "A" }, { key: "b", name: "B" }])
  })

  it("copies a leaf's role (never a parent's, never an invalid one) and the schedule stays valid", () => {
    const s = scheduleFromTemplate({
      stages: [
        { name: "設計", role: "lead", children: [{ name: "基本設計", role: "design" }, { name: "審査", role: "__x" }] },
        { name: "製作", role: "build", durationDays: 4 },
      ],
    })
    expect(s.items).toEqual([
      { key: "s1", name: "設計", children: [{ key: "s2", name: "基本設計", role: "design" }, { key: "s3", name: "審査" }] },
      { key: "s4", name: "製作", durationDays: 4, role: "build" },
    ])
    expect(baseScheduleSchema.safeParse(s).success).toBe(true)
  })
})

describe("templateRoles", () => {
  it("lists the leaves' valid roles once each, in document order", () => {
    expect(
      templateRoles({
        stages: [
          { name: "A", role: "parent", children: [{ name: "a1", role: "design" }, { name: "a2", role: "build" }] },
          { name: "B", role: "design" },
          { name: "C", role: "bad role" },
          { name: "D" },
        ],
      }),
    ).toEqual(["design", "build"])
    expect(templateRoles({ stages: [{ name: "only" }] })).toEqual([])
  })
})
