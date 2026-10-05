import { describe, expect, it } from "vitest"
import { BUILTIN_KEYS, BUILTIN_TEMPLATES, builtinByKey } from "../builtins"
import { TEMPLATE_MAX_DEPTH, countNodes, parseTemplateContent, serializeTemplateContent, templateContentSchema, treeDepth } from "../schema"

const topNames = (key: string) => builtinByKey(key)?.content.stages.map((s) => s.name)

describe("built-in plan templates", () => {
  it("ships the seven common templates with unique keys, in BUILTIN_KEYS order", () => {
    expect(BUILTIN_TEMPLATES.map((b) => b.key)).toEqual([...BUILTIN_KEYS])
    expect(BUILTIN_TEMPLATES.map((b) => b.name)).toEqual(["設備導入", "建屋工事", "IT導入", "イベント", "新工法導入", "長期品質改善", "汎用"])
  })

  it.each(BUILTIN_TEMPLATES.map((b) => [b.key, b] as const))("%s is valid against the content schema and round-trips", (_key, b) => {
    const parsed = templateContentSchema.safeParse(b.content)
    expect(parsed.success).toBe(true)
    expect(treeDepth(b.content.stages)).toBeLessThanOrEqual(TEMPLATE_MAX_DEPTH)
    expect(countNodes(b.content.stages)).toBeGreaterThan(0)
    expect(parseTemplateContent(serializeTemplateContent(b.content))).toEqual(b.content)
  })

  it("keeps the requested stage lists, milestones and check / document lists", () => {
    expect(topNames("equipment")).toEqual(["仕様決定", "発注", "製作", "搬入・据付", "試運転", "立会検収", "引き渡し", "初期流動"])
    expect(topNames("building")).toEqual(["企画・予算承認", "設計", "申請・許認可", "着工", "施工", "竣工検査", "引き渡し"])
    expect(topNames("it")).toEqual(["要件定義", "選定・契約", "構築・設定", "テスト", "教育", "本稼働", "安定稼働確認"])
    expect(topNames("event")).toEqual(["企画", "準備（会場・手配）", "告知", "リハーサル", "当日", "振り返り"])
    expect(topNames("new_method")).toEqual(["調査・検討", "試作", "評価・検証", "量産試行", "標準化", "量産移行"])
    expect(topNames("quality")).toEqual(["現状把握", "要因解析", "対策立案", "対策実施", "効果確認", "歯止め・定着"])
    expect(topNames("generic")).toEqual(["企画", "準備", "実施", "完了報告"])
    const eq = builtinByKey("equipment")?.content
    expect(eq?.checkLabel).toBe("検収")
    expect(eq?.checks?.map((c) => c.name)).toEqual(["能力（サイクルタイム）", "品質（初品・工程能力）", "安全（リスクアセスメント・インターロック）"])
    expect(eq?.documents).toHaveLength(5)
    expect(eq?.stages.filter((s) => s.isMilestone).map((s) => s.name)).toEqual(["立会検収", "引き渡し"])
    expect(builtinByKey("new_method")?.content.checks?.map((c) => c.name)).toEqual(["品質", "コスト", "時間"])
    expect(builtinByKey("nope")).toBeNull()
  })
})

describe("templateContentSchema limits", () => {
  const node = (name: string, children?: object[]) => ({ name, ...(children && { children }) })

  it("rejects more than three levels, more than 200 stages, blank names and bad durations", () => {
    expect(templateContentSchema.safeParse({ stages: [node("a", [node("b", [node("c")])])] }).success).toBe(true)
    expect(templateContentSchema.safeParse({ stages: [node("a", [node("b", [node("c", [node("d")])])])] }).success).toBe(false)
    expect(templateContentSchema.safeParse({ stages: Array.from({ length: 100 }, (_, i) => node(`s${i}`, [node("c")])) }).success).toBe(true)
    expect(templateContentSchema.safeParse({ stages: Array.from({ length: 101 }, (_, i) => node(`s${i}`, [node("c")])) }).success).toBe(false)
    expect(templateContentSchema.safeParse({ stages: [{ name: "  " }] }).success).toBe(false)
    expect(templateContentSchema.safeParse({ stages: [{ name: "a", durationDays: 0 }] }).success).toBe(false)
    expect(templateContentSchema.safeParse({ stages: [{ name: "a", durationDays: 3651 }] }).success).toBe(false)
  })

  it("parseTemplateContent never throws on broken JSON", () => {
    expect(parseTemplateContent("{oops")).toEqual({ stages: [] })
    expect(parseTemplateContent(JSON.stringify({ stages: "x" }))).toEqual({ stages: [] })
  })
})
