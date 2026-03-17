export type GlossaryCategory = "role" | "event" | "artifact" | "tool"

export interface GlossaryEntry {
  term: string
  english: string
  description: string
  kanflow?: string
  category: GlossaryCategory
}

export const CATEGORY_LABELS: Record<GlossaryCategory, string> = {
  role: "ロール",
  event: "イベント",
  artifact: "成果物",
  tool: "ツール",
}

export const CATEGORY_COLORS: Record<GlossaryCategory, string> = {
  role: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  event: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  artifact: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  tool: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
}

export const GLOSSARY_ENTRIES: GlossaryEntry[] = [
  {
    term: "スクラム",
    english: "Scrum",
    description:
      "アジャイル開発のフレームワーク。短い反復サイクル（スプリント）で成果を出す。",
    kanflow: "Kanflow全体がスクラムフレームワークに基づいています",
    category: "tool",
  },
  {
    term: "アジャイル",
    english: "Agile",
    description: "変化に素早く適応する開発手法の総称。",
    category: "tool",
  },
  {
    term: "プロダクトオーナー (PO)",
    english: "Product Owner",
    description:
      "プロダクトの価値を最大化する責任者。バックログの優先順位を決める。",
    kanflow: "プロジェクト設定でPOロールを割り当て",
    category: "role",
  },
  {
    term: "スクラムマスター (SM)",
    english: "Scrum Master",
    description: "チームのプロセスを支援するファシリテーター。",
    kanflow: "プロジェクト設定でSMロールを割り当て",
    category: "role",
  },
  {
    term: "スプリント",
    english: "Sprint",
    description: "1〜4週間の固定期間の開発サイクル。",
    kanflow: "サイドバー → スプリント",
    category: "event",
  },
  {
    term: "プロダクトバックログ (PB)",
    english: "Product Backlog",
    description: "開発すべき項目の優先順位付きリスト。",
    kanflow: "サイドバー → バックログ",
    category: "artifact",
  },
  {
    term: "スプリントバックログ",
    english: "Sprint Backlog",
    description: "今回のスプリントで実施するタスクのリスト。",
    kanflow: "スプリント詳細画面で確認",
    category: "artifact",
  },
  {
    term: "ユーザーストーリー",
    english: "User Story",
    description: "「誰が、何を、なぜ」の形式で書いた要求。",
    kanflow: "バックログの各PBIに記述",
    category: "artifact",
  },
  {
    term: "受入条件",
    english: "Acceptance Criteria",
    description: "ストーリーが完了したとみなす条件。",
    kanflow: "PBI詳細画面の受入条件フィールド",
    category: "artifact",
  },
  {
    term: "バーンダウンチャート",
    english: "Burndown Chart",
    description: "残りタスク数の推移グラフ。",
    kanflow: "レポート画面で確認",
    category: "tool",
  },
  {
    term: "ベロシティ",
    english: "Velocity",
    description: "スプリントあたりの消化ポイント数。",
    kanflow: "レポート画面で確認",
    category: "tool",
  },
  {
    term: "キャパシティ",
    english: "Capacity",
    description: "チームの処理能力（ポイント数）。",
    kanflow: "スプリント作成時に設定",
    category: "tool",
  },
  {
    term: "IceBox",
    english: "IceBox",
    description: "アイデア・要望の一時保管場所。",
    kanflow: "サイドバー → IceBox",
    category: "artifact",
  },
  {
    term: "リリースバックログ",
    english: "Release Backlog",
    description: "リリース予定の項目リスト。",
    kanflow: "サイドバー → リリース",
    category: "artifact",
  },
  {
    term: "KPT",
    english: "Keep / Problem / Try",
    description:
      "振り返りのフレームワーク。続けること・問題・改善策を整理する。",
    kanflow: "スプリント完了時の振り返りセクション",
    category: "event",
  },
  {
    term: "DoD",
    english: "Definition of Done",
    description: "完成の定義。全項目が満たされて初めて「完了」。",
    category: "artifact",
  },
  {
    term: "エピック",
    english: "Epic",
    description: "大きなユーザーストーリーの集まり。",
    kanflow: "バックログのエピックフィールド",
    category: "artifact",
  },
  {
    term: "イニシアティブ",
    english: "Initiative",
    description: "エピックの上位概念。戦略的な施策。",
    kanflow: "バックログのイニシアティブフィールド",
    category: "artifact",
  },
  {
    term: "ガントチャート",
    english: "Gantt Chart",
    description: "タスクのスケジュールを横棒で表示するチャート。",
    kanflow: "サイドバー → ガントチャート",
    category: "tool",
  },
  {
    term: "デイリースクラム",
    english: "Daily Scrum",
    description: "毎日15分の進捗確認ミーティング。",
    category: "event",
  },

  // ── 省略用語（略語から正式名称への参照） ──

  {
    term: "PO",
    english: "Product Owner",
    description: "プロダクトオーナーの略。プロダクトの価値を最大化する責任者。バックログの優先順位決定、IceBoxのレビュー、リリース管理を担当する。",
    kanflow: "プロジェクト設定 → メンバーのロールで「PO」を選択",
    category: "role",
  },
  {
    term: "SM",
    english: "Scrum Master",
    description: "スクラムマスターの略。スクラムのルールとプロセスが正しく運用されるよう支援するファシリテーター。障害の除去やチームの改善を推進する。",
    kanflow: "プロジェクト設定 → メンバーのロールで「SM」を選択",
    category: "role",
  },
  {
    term: "Dev",
    english: "Developer",
    description: "開発チームメンバーの略。スプリント内でタスクを実行し、成果物を作成する。IceBoxへの投稿やタスクステータスの更新が可能。",
    kanflow: "プロジェクト設定 → メンバーのロールで「Dev」を選択",
    category: "role",
  },
  {
    term: "PB",
    english: "Product Backlog",
    description: "プロダクトバックログの略。プロダクトに必要な全ての機能・改善・修正をPOが優先順位をつけて管理するリスト。",
    kanflow: "サイドバー → バックログ（プロダクトバックログ画面）",
    category: "artifact",
  },
  {
    term: "PBI",
    english: "Product Backlog Item",
    description: "プロダクトバックログアイテムの略。バックログ内の個々の項目。ユーザーストーリー、業務負荷点数、受入条件を含む。",
    kanflow: "バックログ画面の各カード（#ID付き）がPBI",
    category: "artifact",
  },
  {
    term: "SBI",
    english: "Sprint Backlog Item",
    description: "スプリントバックログアイテムの略。PBIを分解した個別のタスク。担当者、見積時間、ステータス（Todo/進行中/完了）を持つ。",
    kanflow: "スプリント画面のPBI配下に表示されるタスク行",
    category: "artifact",
  },
  {
    term: "MVP",
    english: "Minimum Viable Product",
    description: "最小実行可能製品の略。価値を検証するために必要最小限の機能を持つ製品バージョン。",
    category: "artifact",
  },
  {
    term: "WIP",
    english: "Work In Progress",
    description: "仕掛り中の作業の略。同時に進行中のタスク数。WIPを制限することでフロー効率が向上する。",
    kanflow: "スプリント画面のタスクステータス「進行中」の数",
    category: "tool",
  },
  {
    term: "PDCA",
    english: "Plan-Do-Check-Act",
    description: "計画→実行→確認→改善のサイクル。スクラムのスプリントはPDCAサイクルの一種。",
    category: "tool",
  },
  {
    term: "ROI",
    english: "Return On Investment",
    description: "投資対効果の略。プロジェクトの投入コストに対する成果の比率。POがバックログの優先順位を決める際の判断基準の一つ。",
    category: "tool",
  },
  {
    term: "SP",
    english: "Story Points",
    description: "ストーリーポイントの略。PBIの相対的な作業量を表す単位。チームの合意で決定する。",
    kanflow: "プロジェクト設定 → 1点の単位で「ストーリーポイント (SP)」を選択可能",
    category: "tool",
  },
]
