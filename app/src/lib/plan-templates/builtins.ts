/**
 * The seven shipped 共通 (common) plan templates. Seeded lazily into
 * plan_template (upsert by builtinKey on the first list) so a fresh DB has
 * them; everyone may edit them, and 「デフォルトに戻す」 restores the content
 * below. Japanese text is the canonical template text (user content, not
 * i18n). Durations (目安期間, calendar days) are rough defaults for 仮置き.
 */
import type { PlanTemplateContent, TemplateNode } from "./schema"

export const BUILTIN_KEYS = ["equipment", "building", "it", "event", "new_method", "quality", "generic"] as const
export type BuiltinKey = (typeof BUILTIN_KEYS)[number]

export interface BuiltinTemplate {
  key: BuiltinKey
  name: string
  description: string
  content: PlanTemplateContent
}

const stage = (name: string, durationDays: number, children?: TemplateNode[], checklist?: string[]): TemplateNode => ({
  name,
  durationDays,
  ...(checklist && { checklist }),
  ...(children && { children }),
})
const milestone = (name: string, checklist?: string[]): TemplateNode => ({ name, isMilestone: true, durationDays: 1, ...(checklist && { checklist }) })
const steps = (...items: Array<[string, number]>): TemplateNode[] => items.map(([n, d]) => stage(n, d))

const EQUIPMENT: BuiltinTemplate = {
  key: "equipment",
  name: "設備導入",
  description: "設備の仕様決定から立会検収・引き渡し・初期流動までの大枠の計画。",
  content: {
    stages: [
      stage("仕様決定", 20, steps(["要求仕様の整理", 7], ["見積依頼・比較", 10], ["仕様書確定", 3]), ["仕様書承認済み"]),
      stage("発注", 10, steps(["稟議・予算承認", 7], ["注文書発行", 3])),
      stage("製作", 60, steps(["設計・図面承認", 15], ["製作", 40], ["メーカー立会（工場検査）", 5])),
      stage("搬入・据付", 10, steps(["搬入計画・養生", 3], ["据付・配線配管", 7])),
      stage("試運転", 10, steps(["単体試運転", 4], ["連続試運転", 6])),
      milestone("立会検収", ["能力・品質・安全の検収項目すべて合格"]),
      milestone("引き渡し", ["引き渡し資料の受領"]),
      stage("初期流動", 30, undefined, ["初期流動管理の解除判定"]),
    ],
    checkLabel: "検収",
    checks: [
      { name: "能力（サイクルタイム）" },
      { name: "品質（初品・工程能力）" },
      { name: "安全（リスクアセスメント・インターロック）" },
    ],
    documents: ["図面", "取扱説明書", "保全資料・スペアパーツリスト", "リスクアセスメント", "検収書"],
    budgetEnabled: true,
  },
}

const BUILDING: BuiltinTemplate = {
  key: "building",
  name: "建屋工事",
  description: "企画・予算承認から設計・許認可・施工・竣工検査・引き渡しまでの大枠の計画。",
  content: {
    stages: [
      stage("企画・予算承認", 30, steps(["要件整理", 14], ["概算見積", 10], ["予算承認", 6])),
      stage("設計", 60, steps(["基本設計", 30], ["実施設計", 30])),
      stage("申請・許認可", 30, steps(["確認申請", 21], ["消防等の事前協議", 9])),
      milestone("着工"),
      stage("施工", 120, steps(["基礎工事", 30], ["躯体工事", 50], ["内装・設備工事", 40])),
      milestone("竣工検査", ["是正事項なし"]),
      milestone("引き渡し", ["竣工図書の受領"]),
    ],
    checkLabel: "竣工検査",
    documents: ["確認申請書類", "竣工図書", "施工写真", "消防・各種届出"],
    budgetEnabled: true,
  },
}

const IT: BuiltinTemplate = {
  key: "it",
  name: "IT導入",
  description: "要件定義・選定から構築・テスト・教育・本稼働・安定稼働確認までの大枠の計画。",
  content: {
    stages: [
      stage("要件定義", 20, steps(["現状業務の整理", 10], ["要件定義書作成", 10]), ["要件定義書承認済み"]),
      stage("選定・契約", 20, steps(["製品・ベンダー比較", 14], ["契約", 6])),
      stage("構築・設定", 30, steps(["環境構築", 10], ["設定・カスタマイズ", 15], ["データ移行準備", 5])),
      stage("テスト", 15, steps(["単体・結合テスト", 8], ["受入テスト", 7])),
      stage("教育", 10, steps(["マニュアル整備", 5], ["利用者教育", 5])),
      milestone("本稼働", ["移行判定会議で承認"]),
      stage("安定稼働確認", 30, undefined, ["問い合わせ・障害が収束"]),
    ],
    checkLabel: "テスト",
    documents: ["要件定義書", "操作マニュアル", "移行計画書", "運用手順書"],
  },
}

const EVENT: BuiltinTemplate = {
  key: "event",
  name: "イベント",
  description: "企画から準備・告知・リハーサル・当日・振り返りまでの大枠の計画。",
  content: {
    stages: [
      stage("企画", 14, steps(["目的・規模の決定", 7], ["予算・体制", 7])),
      stage("準備（会場・手配）", 30, steps(["会場手配", 10], ["備品・業者手配", 14], ["当日運営計画", 6])),
      stage("告知", 14),
      stage("リハーサル", 2),
      milestone("当日"),
      stage("振り返り", 7, steps(["アンケート集計", 4], ["報告書作成", 3])),
    ],
    checkLabel: "準備確認",
    documents: ["実施計画書", "手配物リスト", "アンケート結果", "報告書"],
    budgetEnabled: true,
  },
}

const NEW_METHOD: BuiltinTemplate = {
  key: "new_method",
  name: "新工法導入",
  description: "調査・試作・評価から量産試行・標準化・量産移行までの大枠の計画。",
  content: {
    stages: [
      stage("調査・検討", 20, steps(["文献・事例調査", 10], ["方式検討", 10])),
      stage("試作", 30, steps(["試作条件の決定", 10], ["試作", 20])),
      stage("評価・検証", 20, steps(["品質評価", 8], ["コスト・時間評価", 6], ["評価報告", 6])),
      stage("量産試行", 20),
      milestone("標準化", ["標準書の発行"]),
      milestone("量産移行", ["量産移行判定で承認"]),
    ],
    checkLabel: "評価",
    checks: [{ name: "品質" }, { name: "コスト" }, { name: "時間" }],
    documents: ["評価報告書", "標準書", "教育記録"],
  },
}

const QUALITY: BuiltinTemplate = {
  key: "quality",
  name: "長期品質改善",
  description: "現状把握・要因解析・対策から効果確認・歯止め・定着までの大枠の計画。",
  content: {
    stages: [
      stage("現状把握", 20, steps(["データ収集", 10], ["層別・パレート分析", 10])),
      stage("要因解析", 20, steps(["特性要因図", 7], ["なぜなぜ分析", 7], ["要因の検証", 6])),
      stage("対策立案", 10),
      stage("対策実施", 30),
      stage("効果確認", 30, undefined, ["目標値の達成"]),
      milestone("歯止め・定着", ["標準書改訂・教育の完了"]),
    ],
    checkLabel: "効果確認",
    documents: ["現状把握資料", "要因解析（特性要因図・なぜなぜ）", "対策書", "標準書"],
  },
}

const GENERIC: BuiltinTemplate = {
  key: "generic",
  name: "汎用",
  description: "どのような計画にも使える最小限の大枠（企画 → 準備 → 実施 → 完了報告）。",
  content: {
    stages: [stage("企画", 14), stage("準備", 21), stage("実施", 30), milestone("完了報告")],
  },
}

export const BUILTIN_TEMPLATES: readonly BuiltinTemplate[] = [EQUIPMENT, BUILDING, IT, EVENT, NEW_METHOD, QUALITY, GENERIC]

export function builtinByKey(key: string | null | undefined): BuiltinTemplate | null {
  return BUILTIN_TEMPLATES.find((b) => b.key === key) ?? null
}
