import type { Language } from "@/lib/i18n"
import type { ProjectType } from "@/lib/project-type-labels"

export type GlossaryCategory = "role" | "event" | "artifact" | "tool"

export interface GlossaryEntry {
  term: Record<Language, string>
  english: string
  description: Record<Language, string>
  kanflow?: Record<Language, string>
  category: GlossaryCategory
  projectTypes?: ProjectType[]
}

export const CATEGORY_LABELS: Record<GlossaryCategory, Record<Language, string>> = {
  role: { ja: "ロール", en: "Role", id: "Peran" },
  event: { ja: "イベント", en: "Event", id: "Acara" },
  artifact: { ja: "成果物", en: "Artifact", id: "Artefak" },
  tool: { ja: "ツール", en: "Tool", id: "Alat" },
}

export const CATEGORY_COLORS: Record<GlossaryCategory, string> = {
  role: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  event: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  artifact: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  tool: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
}

export const GLOSSARY_ENTRIES: GlossaryEntry[] = [
  {
    term: { ja: "スクラム", en: "Scrum", id: "Scrum" },
    english: "Scrum",
    description: {
      ja: "アジャイル開発のフレームワーク。短い反復サイクル（スプリント）で成果を出す。",
      en: "An agile development framework that delivers results in short iterative cycles called sprints.",
      id: "Kerangka kerja pengembangan agile yang menghasilkan hasil dalam siklus iterasi pendek yang disebut sprint.",
    },
    kanflow: {
      ja: "Kanflow全体がスクラムフレームワークに基づいています",
      en: "Kanflow is built on the Scrum framework",
      id: "Kanflow dibangun berdasarkan kerangka kerja Scrum",
    },
    category: "tool",
  },
  {
    term: { ja: "アジャイル", en: "Agile", id: "Agile" },
    english: "Agile",
    description: {
      ja: "変化に素早く適応する開発手法の総称。",
      en: "A collective term for development methodologies that quickly adapt to change.",
      id: "Istilah umum untuk metodologi pengembangan yang cepat beradaptasi dengan perubahan.",
    },
    category: "tool",
  },
  {
    term: { ja: "プロダクトオーナー (PO)", en: "Product Owner (PO)", id: "Product Owner (PO)" },
    english: "Product Owner",
    description: {
      ja: "プロダクトの価値を最大化する責任者。バックログの優先順位を決める。",
      en: "The person responsible for maximizing product value. Decides backlog priority.",
      id: "Orang yang bertanggung jawab memaksimalkan nilai produk. Menentukan prioritas backlog.",
    },
    kanflow: {
      ja: "プロジェクト設定でPOロールを割り当て",
      en: "Assign the PO role in Project Settings",
      id: "Tetapkan peran PO di Pengaturan Proyek",
    },
    category: "role",
  },
  {
    term: { ja: "スクラムマスター (SM)", en: "Scrum Master (SM)", id: "Scrum Master (SM)" },
    english: "Scrum Master",
    description: {
      ja: "チームのプロセスを支援するファシリテーター。",
      en: "A facilitator who supports the team's processes.",
      id: "Fasilitator yang mendukung proses tim.",
    },
    kanflow: {
      ja: "プロジェクト設定でSMロールを割り当て",
      en: "Assign the SM role in Project Settings",
      id: "Tetapkan peran SM di Pengaturan Proyek",
    },
    category: "role",
  },
  {
    term: { ja: "スプリント", en: "Sprint", id: "Sprint" },
    english: "Sprint",
    description: {
      ja: "1〜4週間の固定期間の開発サイクル。",
      en: "A fixed-length development cycle of 1 to 4 weeks.",
      id: "Siklus pengembangan dengan durasi tetap 1 hingga 4 minggu.",
    },
    kanflow: {
      ja: "サイドバー → スプリント",
      en: "Sidebar → Sprints",
      id: "Sidebar → Sprint",
    },
    category: "event",
  },
  {
    term: { ja: "プロダクトバックログ (PB)", en: "Product Backlog (PB)", id: "Product Backlog (PB)" },
    english: "Product Backlog",
    description: {
      ja: "開発すべき項目の優先順位付きリスト。",
      en: "A prioritized list of items to be developed.",
      id: "Daftar item yang diprioritaskan untuk dikembangkan.",
    },
    kanflow: {
      ja: "サイドバー → バックログ",
      en: "Sidebar → Backlog",
      id: "Sidebar → Backlog",
    },
    category: "artifact",
  },
  {
    term: { ja: "スプリントバックログ", en: "Sprint Backlog", id: "Sprint Backlog" },
    english: "Sprint Backlog",
    description: {
      ja: "今回のスプリントで実施するタスクのリスト。",
      en: "The list of tasks to be completed in the current sprint.",
      id: "Daftar tugas yang harus diselesaikan dalam sprint saat ini.",
    },
    kanflow: {
      ja: "スプリント詳細画面で確認",
      en: "View in the Sprint detail screen",
      id: "Lihat di layar detail Sprint",
    },
    category: "artifact",
  },
  {
    term: { ja: "ユーザーストーリー", en: "User Story", id: "User Story" },
    english: "User Story",
    description: {
      ja: "「誰が、何を、なぜ」の形式で書いた要求。",
      en: "A requirement written in the format 'As a [who], I want [what], so that [why].'",
      id: "Kebutuhan yang ditulis dalam format 'Sebagai [siapa], saya ingin [apa], sehingga [mengapa].'",
    },
    kanflow: {
      ja: "バックログの各PBIに記述",
      en: "Described in each PBI in the Backlog",
      id: "Dijelaskan di setiap PBI di Backlog",
    },
    category: "artifact",
    projectTypes: ["software"],
  },
  {
    term: { ja: "受入条件", en: "Acceptance Criteria", id: "Kriteria Penerimaan" },
    english: "Acceptance Criteria",
    description: {
      ja: "ストーリーが完了したとみなす条件。",
      en: "The conditions that must be met for a story to be considered complete.",
      id: "Kondisi yang harus dipenuhi agar sebuah cerita dianggap selesai.",
    },
    kanflow: {
      ja: "PBI詳細画面の受入条件フィールド",
      en: "Acceptance Criteria field in the PBI detail screen",
      id: "Kolom Kriteria Penerimaan di layar detail PBI",
    },
    category: "artifact",
    projectTypes: ["software"],
  },
  {
    term: { ja: "バーンダウンチャート", en: "Burndown Chart", id: "Burndown Chart" },
    english: "Burndown Chart",
    description: {
      ja: "残りタスク数の推移グラフ。",
      en: "A graph showing the trend of remaining tasks over time.",
      id: "Grafik yang menunjukkan tren tugas yang tersisa dari waktu ke waktu.",
    },
    kanflow: {
      ja: "レポート画面で確認",
      en: "View in the Reports screen",
      id: "Lihat di layar Laporan",
    },
    category: "tool",
  },
  {
    term: { ja: "ベロシティ", en: "Velocity", id: "Velocity" },
    english: "Velocity",
    description: {
      ja: "スプリントあたりの消化ポイント数。",
      en: "The number of points completed per sprint.",
      id: "Jumlah poin yang diselesaikan per sprint.",
    },
    kanflow: {
      ja: "レポート画面で確認",
      en: "View in the Reports screen",
      id: "Lihat di layar Laporan",
    },
    category: "tool",
  },
  {
    term: { ja: "キャパシティ", en: "Capacity", id: "Kapasitas" },
    english: "Capacity",
    description: {
      ja: "チームの処理能力（ポイント数）。",
      en: "The team's processing capacity (in points).",
      id: "Kapasitas pemrosesan tim (dalam poin).",
    },
    kanflow: {
      ja: "スプリント作成時に設定",
      en: "Set when creating a sprint",
      id: "Ditetapkan saat membuat sprint",
    },
    category: "tool",
  },
  {
    term: { ja: "IceBox", en: "IceBox", id: "IceBox" },
    english: "IceBox",
    description: {
      ja: "アイデア・要望の一時保管場所。",
      en: "A temporary storage area for ideas and requests.",
      id: "Tempat penyimpanan sementara untuk ide dan permintaan.",
    },
    kanflow: {
      ja: "サイドバー → IceBox",
      en: "Sidebar → IceBox",
      id: "Sidebar → IceBox",
    },
    category: "artifact",
  },
  {
    term: { ja: "リリースバックログ", en: "Release Backlog", id: "Release Backlog" },
    english: "Release Backlog",
    description: {
      ja: "リリース予定の項目リスト。",
      en: "A list of items scheduled for release.",
      id: "Daftar item yang dijadwalkan untuk dirilis.",
    },
    kanflow: {
      ja: "サイドバー → リリース",
      en: "Sidebar → Releases",
      id: "Sidebar → Rilis",
    },
    category: "artifact",
    projectTypes: ["software"],
  },
  {
    term: { ja: "KPT", en: "KPT", id: "KPT" },
    english: "Keep / Problem / Try",
    description: {
      ja: "振り返りのフレームワーク。続けること・問題・改善策を整理する。",
      en: "A retrospective framework. Organize what to keep, problems, and improvements to try.",
      id: "Kerangka kerja retrospektif. Mengatur apa yang harus dipertahankan, masalah, dan perbaikan yang harus dicoba.",
    },
    kanflow: {
      ja: "スプリント完了時の振り返りセクション",
      en: "Retrospective section at sprint completion",
      id: "Bagian retrospektif saat penyelesaian sprint",
    },
    category: "event",
  },
  {
    term: { ja: "DoD", en: "DoD", id: "DoD" },
    english: "Definition of Done",
    description: {
      ja: "完成の定義。全項目が満たされて初めて「完了」。",
      en: "The definition of done. Work is only 'done' when all criteria are met.",
      id: "Definisi selesai. Pekerjaan hanya 'selesai' ketika semua kriteria terpenuhi.",
    },
    category: "artifact",
  },
  {
    term: { ja: "エピック", en: "Epic", id: "Epic" },
    english: "Epic",
    description: {
      ja: "大きなユーザーストーリーの集まり。",
      en: "A collection of large user stories.",
      id: "Kumpulan user story yang besar.",
    },
    kanflow: {
      ja: "バックログのエピックフィールド",
      en: "Epic field in the Backlog",
      id: "Kolom Epic di Backlog",
    },
    category: "artifact",
    projectTypes: ["software"],
  },
  {
    term: { ja: "イニシアティブ", en: "Initiative", id: "Inisiatif" },
    english: "Initiative",
    description: {
      ja: "エピックの上位概念。戦略的な施策。",
      en: "A higher-level concept above epics. A strategic initiative.",
      id: "Konsep tingkat lebih tinggi di atas epic. Inisiatif strategis.",
    },
    kanflow: {
      ja: "バックログのイニシアティブフィールド",
      en: "Initiative field in the Backlog",
      id: "Kolom Inisiatif di Backlog",
    },
    category: "artifact",
    projectTypes: ["software"],
  },
  {
    term: { ja: "ガントチャート", en: "Gantt Chart", id: "Gantt Chart" },
    english: "Gantt Chart",
    description: {
      ja: "タスクのスケジュールを横棒で表示するチャート。",
      en: "A chart that displays task schedules as horizontal bars.",
      id: "Bagan yang menampilkan jadwal tugas sebagai batang horizontal.",
    },
    kanflow: {
      ja: "サイドバー → ガントチャート",
      en: "Sidebar → Gantt Chart",
      id: "Sidebar → Gantt Chart",
    },
    category: "tool",
  },
  {
    term: { ja: "デイリースクラム", en: "Daily Scrum", id: "Daily Scrum" },
    english: "Daily Scrum",
    description: {
      ja: "毎日15分の進捗確認ミーティング。",
      en: "A 15-minute daily meeting to check progress.",
      id: "Rapat harian 15 menit untuk memeriksa kemajuan.",
    },
    category: "event",
  },
  {
    term: { ja: "プロダクトゴール", en: "Product Goal", id: "Product Goal" },
    english: "Product Goal",
    description: {
      ja: "プロダクトの将来の状態を表す長期的な目標。チームが目指す方向性を示す「北極星」。全てのバックログアイテムはプロダクトゴールに貢献するものであるべき。",
      en: "A long-term objective describing the future state of the product. The 'North Star' that guides the team's direction. All backlog items should contribute to the Product Goal.",
      id: "Tujuan jangka panjang yang menggambarkan keadaan produk di masa depan. 'Bintang Utara' yang memandu arah tim. Semua item backlog harus berkontribusi pada Product Goal.",
    },
    kanflow: {
      ja: "ダッシュボード → プロダクトゴール セクション",
      en: "Dashboard → Product Goal section",
      id: "Dashboard → Bagian Product Goal",
    },
    category: "artifact",
  },
  {
    term: { ja: "スプリントゴール", en: "Sprint Goal", id: "Sprint Goal" },
    english: "Sprint Goal",
    description: {
      ja: "各スプリントで達成すべき具体的な目標。プロダクトゴールに向かうための中間ステップ。チームの意思決定の指針となる。",
      en: "A specific objective to be achieved in each sprint. An intermediate step toward the Product Goal. Guides the team's decision-making.",
      id: "Tujuan spesifik yang harus dicapai di setiap sprint. Langkah perantara menuju Product Goal. Memandu pengambilan keputusan tim.",
    },
    kanflow: {
      ja: "スプリント作成時の「スプリントゴール」フィールド",
      en: "The 'Sprint Goal' field when creating a sprint",
      id: "Kolom 'Sprint Goal' saat membuat sprint",
    },
    category: "event",
  },

  // ── Abbreviations ──

  {
    term: { ja: "PO", en: "PO", id: "PO" },
    english: "Product Owner",
    description: {
      ja: "プロダクトオーナーの略。プロダクトの価値を最大化する責任者。バックログの優先順位決定、IceBoxのレビュー、リリース管理を担当する。",
      en: "Abbreviation for Product Owner. Responsible for maximizing product value. Handles backlog prioritization, IceBox review, and release management.",
      id: "Singkatan dari Product Owner. Bertanggung jawab memaksimalkan nilai produk. Menangani prioritas backlog, tinjauan IceBox, dan manajemen rilis.",
    },
    kanflow: {
      ja: "プロジェクト設定 → メンバーのロールで「PO」を選択",
      en: "Project Settings → Select 'PO' for the member's role",
      id: "Pengaturan Proyek → Pilih 'PO' untuk peran anggota",
    },
    category: "role",
  },
  {
    term: { ja: "SM", en: "SM", id: "SM" },
    english: "Scrum Master",
    description: {
      ja: "スクラムマスターの略。スクラムのルールとプロセスが正しく運用されるよう支援するファシリテーター。障害の除去やチームの改善を推進する。",
      en: "Abbreviation for Scrum Master. A facilitator who ensures Scrum rules and processes are properly followed. Removes impediments and drives team improvement.",
      id: "Singkatan dari Scrum Master. Fasilitator yang memastikan aturan dan proses Scrum dijalankan dengan benar. Menghilangkan hambatan dan mendorong peningkatan tim.",
    },
    kanflow: {
      ja: "プロジェクト設定 → メンバーのロールで「SM」を選択",
      en: "Project Settings → Select 'SM' for the member's role",
      id: "Pengaturan Proyek → Pilih 'SM' untuk peran anggota",
    },
    category: "role",
  },
  {
    term: { ja: "Dev", en: "Dev", id: "Dev" },
    english: "Developer",
    description: {
      ja: "開発チームメンバーの略。スプリント内でタスクを実行し、成果物を作成する。IceBoxへの投稿やタスクステータスの更新が可能。",
      en: "Abbreviation for Developer. Executes tasks within the sprint and creates deliverables. Can post to IceBox and update task statuses.",
      id: "Singkatan dari Developer. Menjalankan tugas dalam sprint dan membuat hasil kerja. Dapat memposting ke IceBox dan memperbarui status tugas.",
    },
    kanflow: {
      ja: "プロジェクト設定 → メンバーのロールで「Dev」を選択",
      en: "Project Settings → Select 'Dev' for the member's role",
      id: "Pengaturan Proyek → Pilih 'Dev' untuk peran anggota",
    },
    category: "role",
  },
  {
    term: { ja: "PB", en: "PB", id: "PB" },
    english: "Product Backlog",
    description: {
      ja: "プロダクトバックログの略。プロダクトに必要な全ての機能・改善・修正をPOが優先順位をつけて管理するリスト。",
      en: "Abbreviation for Product Backlog. A prioritized list of all features, improvements, and fixes needed for the product, managed by the PO.",
      id: "Singkatan dari Product Backlog. Daftar prioritas semua fitur, peningkatan, dan perbaikan yang dibutuhkan untuk produk, dikelola oleh PO.",
    },
    kanflow: {
      ja: "サイドバー → バックログ（プロダクトバックログ画面）",
      en: "Sidebar → Backlog (Product Backlog screen)",
      id: "Sidebar → Backlog (layar Product Backlog)",
    },
    category: "artifact",
  },
  {
    term: { ja: "PBI", en: "PBI", id: "PBI" },
    english: "Product Backlog Item",
    description: {
      ja: "プロダクトバックログアイテムの略。バックログ内の個々の項目。ユーザーストーリー、業務負荷点数、受入条件を含む。",
      en: "Abbreviation for Product Backlog Item. An individual item in the backlog. Includes user story, effort points, and acceptance criteria.",
      id: "Singkatan dari Product Backlog Item. Item individual dalam backlog. Termasuk user story, poin upaya, dan kriteria penerimaan.",
    },
    kanflow: {
      ja: "バックログ画面の各カード（#ID付き）がPBI",
      en: "Each card (with #ID) in the Backlog screen is a PBI",
      id: "Setiap kartu (dengan #ID) di layar Backlog adalah PBI",
    },
    category: "artifact",
  },
  {
    term: { ja: "SBI", en: "SBI", id: "SBI" },
    english: "Sprint Backlog Item",
    description: {
      ja: "スプリントバックログアイテムの略。PBIを分解した個別のタスク。担当者、見積時間、ステータス（Todo/進行中/完了）を持つ。",
      en: "Abbreviation for Sprint Backlog Item. An individual task broken down from a PBI. Has an assignee, estimated time, and status (Todo/In Progress/Done).",
      id: "Singkatan dari Sprint Backlog Item. Tugas individual yang dipecah dari PBI. Memiliki penerima tugas, estimasi waktu, dan status (Todo/Sedang Berlangsung/Selesai).",
    },
    kanflow: {
      ja: "スプリント画面のPBI配下に表示されるタスク行",
      en: "Task rows displayed under PBIs in the Sprint screen",
      id: "Baris tugas yang ditampilkan di bawah PBI di layar Sprint",
    },
    category: "artifact",
  },
  {
    term: { ja: "MVP", en: "MVP", id: "MVP" },
    english: "Minimum Viable Product",
    description: {
      ja: "最小実行可能製品の略。価値を検証するために必要最小限の機能を持つ製品バージョン。",
      en: "Abbreviation for Minimum Viable Product. A product version with the minimum features needed to validate value.",
      id: "Singkatan dari Minimum Viable Product. Versi produk dengan fitur minimum yang diperlukan untuk memvalidasi nilai.",
    },
    category: "artifact",
    projectTypes: ["software"],
  },
  {
    term: { ja: "WIP", en: "WIP", id: "WIP" },
    english: "Work In Progress",
    description: {
      ja: "仕掛り中の作業の略。同時に進行中のタスク数。WIPを制限することでフロー効率が向上する。",
      en: "Abbreviation for Work In Progress. The number of tasks currently in progress. Limiting WIP improves flow efficiency.",
      id: "Singkatan dari Work In Progress. Jumlah tugas yang sedang berlangsung. Membatasi WIP meningkatkan efisiensi aliran.",
    },
    kanflow: {
      ja: "スプリント画面のタスクステータス「進行中」の数",
      en: "Number of tasks with 'In Progress' status in the Sprint screen",
      id: "Jumlah tugas dengan status 'Sedang Berlangsung' di layar Sprint",
    },
    category: "tool",
  },
  {
    term: { ja: "PDCA", en: "PDCA", id: "PDCA" },
    english: "Plan-Do-Check-Act",
    description: {
      ja: "計画→実行→確認→改善のサイクル。スクラムのスプリントはPDCAサイクルの一種。",
      en: "A Plan-Do-Check-Act cycle. Scrum sprints are a form of PDCA cycle.",
      id: "Siklus Plan-Do-Check-Act. Sprint Scrum adalah bentuk siklus PDCA.",
    },
    category: "tool",
  },
  {
    term: { ja: "ROI", en: "ROI", id: "ROI" },
    english: "Return On Investment",
    description: {
      ja: "投資対効果の略。プロジェクトの投入コストに対する成果の比率。POがバックログの優先順位を決める際の判断基準の一つ。",
      en: "Abbreviation for Return On Investment. The ratio of results to project costs. One of the criteria the PO uses to prioritize the backlog.",
      id: "Singkatan dari Return On Investment. Rasio hasil terhadap biaya proyek. Salah satu kriteria yang digunakan PO untuk memprioritaskan backlog.",
    },
    category: "tool",
  },
  {
    term: { ja: "SP", en: "SP", id: "SP" },
    english: "Story Points",
    description: {
      ja: "ストーリーポイントの略。PBIの相対的な作業量を表す単位。チームの合意で決定する。",
      en: "Abbreviation for Story Points. A unit representing the relative effort of a PBI. Decided by team consensus.",
      id: "Singkatan dari Story Points. Satuan yang merepresentasikan upaya relatif dari PBI. Ditentukan oleh konsensus tim.",
    },
    kanflow: {
      ja: "プロジェクト設定 → 1点の単位で「ストーリーポイント (SP)」を選択可能",
      en: "Project Settings → Select 'Story Points (SP)' as the unit",
      id: "Pengaturan Proyek → Pilih 'Story Points (SP)' sebagai satuan",
    },
    category: "tool",
  },

  // ── Process improvement project terms ──

  {
    term: { ja: "改善", en: "Kaizen", id: "Kaizen" },
    english: "Kaizen",
    description: {
      ja: "日本発の継続的改善の概念。小さな改善を積み重ねて大きな成果を得る手法。英語でもKaizenとして定着している。",
      en: "A Japanese concept of continuous improvement. A method of achieving significant results through accumulated small improvements. Known worldwide as 'Kaizen'.",
      id: "Konsep perbaikan berkelanjutan dari Jepang. Metode mencapai hasil signifikan melalui akumulasi perbaikan kecil. Dikenal di seluruh dunia sebagai 'Kaizen'.",
    },
    category: "tool",
    projectTypes: ["process_improvement"],
  },
  {
    term: { ja: "改善サイクル", en: "Kaizen Cycle", id: "Siklus Kaizen" },
    english: "Kaizen Cycle",
    description: {
      ja: "スプリントの工程改善版。一定期間で改善施策を計画・実行・検証するサイクル。",
      en: "The process improvement version of a sprint. A cycle for planning, executing, and verifying improvement measures within a fixed period.",
      id: "Versi perbaikan proses dari sprint. Siklus untuk merencanakan, melaksanakan, dan memverifikasi langkah-langkah perbaikan dalam periode tetap.",
    },
    kanflow: {
      ja: "サイドバー → 改善サイクル",
      en: "Sidebar → Kaizen Cycles",
      id: "Sidebar → Siklus Kaizen",
    },
    category: "event",
    projectTypes: ["process_improvement"],
  },
  {
    term: { ja: "改善バックログ", en: "Kaizen Backlog", id: "Kaizen Backlog" },
    english: "Kaizen Backlog",
    description: {
      ja: "プロダクトバックログの工程改善版。改善すべき項目を優先順位付きで管理するリスト。",
      en: "The process improvement version of a product backlog. A prioritized list of items to be improved.",
      id: "Versi perbaikan proses dari product backlog. Daftar prioritas item yang perlu diperbaiki.",
    },
    kanflow: {
      ja: "サイドバー → 改善バックログ",
      en: "Sidebar → Kaizen Backlog",
      id: "Sidebar → Kaizen Backlog",
    },
    category: "artifact",
    projectTypes: ["process_improvement"],
  },
  {
    term: { ja: "改善オーナー", en: "Kaizen Owner", id: "Kaizen Owner" },
    english: "Kaizen Owner",
    description: {
      ja: "プロダクトオーナーの工程改善版。改善活動の方向性と優先順位を決定する責任者。",
      en: "The process improvement version of a Product Owner. Responsible for determining the direction and priorities of improvement activities.",
      id: "Versi perbaikan proses dari Product Owner. Bertanggung jawab menentukan arah dan prioritas kegiatan perbaikan.",
    },
    kanflow: {
      ja: "プロジェクト設定でロールを割り当て",
      en: "Assign the role in Project Settings",
      id: "Tetapkan peran di Pengaturan Proyek",
    },
    category: "role",
    projectTypes: ["process_improvement"],
  },
  {
    term: { ja: "標準化", en: "Standardization", id: "Standardisasi" },
    english: "Standardization",
    description: {
      ja: "改善成果を標準作業手順書（SOP）に組み込み、組織全体に展開すること。",
      en: "Incorporating improvement results into Standard Operating Procedures (SOPs) and deploying them across the organization.",
      id: "Memasukkan hasil perbaikan ke dalam Prosedur Operasi Standar (SOP) dan menerapkannya di seluruh organisasi.",
    },
    category: "tool",
    projectTypes: ["process_improvement"],
  },
  {
    term: { ja: "QCサークル", en: "QC Circle", id: "QC Circle" },
    english: "QC Circle",
    description: {
      ja: "品質管理の小グループ活動。現場の作業者が自主的に品質改善に取り組む。",
      en: "A small group activity for quality control. Shop floor workers voluntarily engage in quality improvement.",
      id: "Kegiatan kelompok kecil untuk pengendalian kualitas. Pekerja di lapangan secara sukarela terlibat dalam peningkatan kualitas.",
    },
    category: "tool",
    projectTypes: ["process_improvement"],
  },
  {
    term: { ja: "5S", en: "5S", id: "5S" },
    english: "5S",
    description: {
      ja: "整理・整頓・清掃・清潔・躾の頭文字。職場環境改善の基本手法。",
      en: "Sort, Set in order, Shine, Standardize, Sustain. A foundational methodology for workplace improvement.",
      id: "Sort, Set in order, Shine, Standardize, Sustain. Metodologi dasar untuk perbaikan tempat kerja.",
    },
    category: "tool",
    projectTypes: ["process_improvement"],
  },
  {
    term: { ja: "OEE", en: "OEE", id: "OEE" },
    english: "Overall Equipment Effectiveness",
    description: {
      ja: "設備総合効率。可用率×性能率×品質率で算出し、設備の生産性を測定する指標。",
      en: "Overall Equipment Effectiveness. Calculated as Availability x Performance x Quality, it measures equipment productivity.",
      id: "Overall Equipment Effectiveness. Dihitung sebagai Ketersediaan x Kinerja x Kualitas, mengukur produktivitas peralatan.",
    },
    category: "tool",
    projectTypes: ["process_improvement"],
  },
  {
    term: { ja: "SMED", en: "SMED", id: "SMED" },
    english: "Single-Minute Exchange of Die",
    description: {
      ja: "段取替え時間を10分以内に短縮する手法。生産のリードタイム短縮に貢献する。",
      en: "A method for reducing changeover time to under 10 minutes. Contributes to shorter production lead times.",
      id: "Metode untuk mengurangi waktu pergantian menjadi kurang dari 10 menit. Berkontribusi pada waktu tunggu produksi yang lebih pendek.",
    },
    category: "tool",
    projectTypes: ["process_improvement"],
  },
]
