import type { Language } from "@/lib/i18n"
import type { ProjectTypeLabels } from "@/lib/project-type-labels"
import type { StepText } from "./guide-steps"

/** Getting-started steps for general projects. */
export function generalSteps(pt: ProjectTypeLabels): Record<Language, StepText[]> {
  return {
    ja: [
      {
        title: "プロジェクトゴール — 目指す姿を定める",
        description: "プロジェクト開始時に、チームが目指す最終的な目標を設定します。プロジェクトゴールは全ての活動の方向性を示す「北極星」です。バックログの優先順位もゴールに基づいて判断します。",
        operation: "ダッシュボード → プロダクトゴール → ゴール追加",
        hint: "ゴールは具体的で測定可能なものが理想的です。例:「イベント参加者を200名達成」「業務効率を30%改善」",
      },
      {
        title: "アイデアBox — アイデアを集める",
        description: "チームメンバーの誰でもアイデアや提案を投稿できます。写真や資料も添付可能です。",
        operation: `サイドバーの ${pt.navIcebox} → 要望を追加 ボタン`,
        hint: "気軽に投稿してください。この段階では精査は不要です。",
      },
      {
        title: "オーナーレビュー — アイデアを精査する",
        description: `${pt.rolePO}（オーナー）が${pt.navIcebox}の提案をレビューし、確認済み・凍結に分類します。`,
        operation: "各カードの右側のステータス変更ボタン",
      },
      {
        title: "プロジェクトバックログ — 優先順位を決める",
        description: `確認済みの提案を${pt.navBacklog}に移し、詳細化します。${pt.rolePO}が業務負荷点数と優先順位を設定します。`,
        operation: `${pt.navBacklog} → PBI追加、ドラッグで並び替え`,
      },
      {
        title: "スプリント計画 — 次にやることを決める",
        description: `1〜4週間の${pt.navSprints}を作成し、${pt.navBacklog}の上位アイテムを取り込みます。キャパシティ（チームの処理能力）を設定し、過負荷にならないよう調整します。`,
        operation: `${pt.navSprints} → 新規作成 → バックログから取り込み`,
      },
      {
        title: "タスク実行 — タスクを進める",
        description: "バックログ項目をタスクに分解し、担当者をアサイン。ステータスをクリックで Todo → 進行中 → 完了 と更新します。",
        operation: "各タスクのステータスアイコンをクリック",
      },
      {
        title: "レビュー＆振り返り — 改善する",
        description: "スプリント終了時にレビューコメントと振り返りメモ（KPT）を記録。次のスプリントに活かします。",
      },
      {
        title: "成果物・マイルストーン — 成果を届ける",
        description: "完了した項目をまとめ、マイルストーンとして管理・共有します。",
        operation: `サイドバー → ${pt.navReleases} → 作成`,
      },
    ],
    en: [
      {
        title: "Project Goal — Define the Target State",
        description: "At the start of the project, set the ultimate goal the team aims for. The Project Goal is the 'North Star' guiding all activities. Backlog priorities are also determined based on this goal.",
        operation: "Dashboard → Product Goal → Add Goal",
        hint: "Goals should ideally be specific and measurable. Example: 'Reach 200 event attendees' or 'Improve operational efficiency by 30%'",
      },
      {
        title: "Idea Box — Gather Ideas",
        description: "Any team member can submit ideas and proposals. Photos and documents can be attached.",
        operation: `Sidebar → ${pt.navIcebox} → Add Request button`,
        hint: "Feel free to post freely. No screening is needed at this stage.",
      },
      {
        title: "Owner Review — Screen Ideas",
        description: `The ${pt.rolePO} (Owner) reviews proposals in ${pt.navIcebox} and classifies them as Confirmed or Frozen.`,
        operation: "Status change button on the right side of each card",
      },
      {
        title: "Project Backlog — Set Priorities",
        description: `Move confirmed proposals to the ${pt.navBacklog} and refine them. The ${pt.rolePO} sets effort points and priorities.`,
        operation: `${pt.navBacklog} → Add PBI, drag to reorder`,
      },
      {
        title: "Sprint Planning — Decide What to Do Next",
        description: `Create a 1-4 week ${pt.navSprints}, and pull in top items from the ${pt.navBacklog}. Set the capacity (team throughput) and adjust to avoid overload.`,
        operation: `${pt.navSprints} → Create New → Pull from Backlog`,
      },
      {
        title: "Execute Tasks — Work on Tasks",
        description: "Break backlog items into tasks and assign owners. Click the status to update: Todo → In Progress → Done.",
        operation: "Click the status icon on each task",
      },
      {
        title: "Review & Reflect — Improve",
        description: "At the end of the sprint, record review comments and retrospective notes (KPT). Apply learnings to the next sprint.",
      },
      {
        title: "Deliverables & Milestones — Deliver Results",
        description: "Consolidate completed items and manage and share them as milestones.",
        operation: `Sidebar → ${pt.navReleases} → Create`,
      },
    ],
    id: [
      {
        title: "Tujuan Proyek — Tentukan Target",
        description: "Di awal proyek, tetapkan tujuan akhir yang ingin dicapai tim. Tujuan Proyek adalah 'Bintang Utara' yang memandu semua aktivitas. Prioritas backlog juga ditentukan berdasarkan tujuan ini.",
        operation: "Dashboard → Product Goal → Tambah Goal",
        hint: "Tujuan idealnya spesifik dan terukur. Contoh: 'Capai 200 peserta acara' atau 'Tingkatkan efisiensi operasional 30%'",
      },
      {
        title: "Kotak Ide — Kumpulkan Ide",
        description: "Setiap anggota tim dapat mengirimkan ide dan proposal. Foto dan dokumen dapat dilampirkan.",
        operation: `Sidebar → ${pt.navIcebox} → Tombol Tambah Permintaan`,
        hint: "Silakan posting dengan bebas. Tidak perlu penyaringan di tahap ini.",
      },
      {
        title: "Tinjauan Owner — Saring Ide",
        description: `${pt.rolePO} (Owner) meninjau proposal di ${pt.navIcebox} dan mengklasifikasikannya sebagai Dikonfirmasi atau Dibekukan.`,
        operation: "Tombol perubahan status di sisi kanan setiap kartu",
      },
      {
        title: "Backlog Proyek — Tetapkan Prioritas",
        description: `Pindahkan proposal yang dikonfirmasi ke ${pt.navBacklog} dan perinci. ${pt.rolePO} menetapkan poin upaya dan prioritas.`,
        operation: `${pt.navBacklog} → Tambah PBI, seret untuk mengurutkan`,
      },
      {
        title: "Perencanaan Sprint — Putuskan Apa yang Dilakukan Selanjutnya",
        description: `Buat ${pt.navSprints} 1-4 minggu, dan tarik item teratas dari ${pt.navBacklog}. Atur kapasitas (throughput tim) dan sesuaikan untuk menghindari kelebihan beban.`,
        operation: `${pt.navSprints} → Buat Baru → Tarik dari Backlog`,
      },
      {
        title: "Jalankan Tugas — Kerjakan Tugas",
        description: "Pecah item backlog menjadi tugas dan tetapkan penanggung jawab. Klik status untuk memperbarui: Todo → Sedang Berlangsung → Selesai.",
        operation: "Klik ikon status pada setiap tugas",
      },
      {
        title: "Tinjauan & Refleksi — Perbaiki",
        description: "Di akhir sprint, catat komentar tinjauan dan catatan retrospektif (KPT). Terapkan pembelajaran ke sprint berikutnya.",
      },
      {
        title: "Hasil & Tonggak — Serahkan Hasil",
        description: "Konsolidasikan item yang telah selesai dan kelola serta bagikan sebagai tonggak pencapaian.",
        operation: `Sidebar → ${pt.navReleases} → Buat`,
      },
    ],
  }
}
