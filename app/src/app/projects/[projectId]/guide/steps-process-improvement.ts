import type { Language } from "@/lib/i18n"
import type { ProjectTypeLabels } from "@/lib/project-type-labels"
import type { StepText } from "./guide-steps"

/** Getting-started steps for process-improvement (KAIZEN) projects. */
export function processImprovementSteps(pt: ProjectTypeLabels): Record<Language, StepText[]> {
  return {
    ja: [
      {
        title: "改善ゴール — 目指す姿を定める",
        description: "プロジェクト開始時に、チームが目指す改善の最終的な目標を設定します。改善ゴールは全ての活動の方向性を示す「北極星」です。改善バックログの優先順位もゴールに基づいて判断します。",
        operation: "ダッシュボード → プロダクトゴール → ゴール追加",
        hint: "ゴールは具体的で測定可能なものが理想的です。例:「不良率を50%削減」「段取替え時間を10分以内に短縮」",
      },
      {
        title: "改善要望 — 現場の気づきを集める",
        description: "チームメンバーの誰でも改善要望や現場の気づきを投稿できます。写真や資料も添付可能です。",
        operation: `サイドバーの ${pt.navIcebox} → 要望を追加 ボタン`,
        hint: "気軽に投稿してください。この段階では精査は不要です。",
      },
      {
        title: "改善オーナーレビュー — 要望を精査する",
        description: `${pt.rolePO}（改善オーナー）が${pt.navIcebox}の要望をレビューし、確認済み・凍結に分類します。`,
        operation: "各カードの右側のステータス変更ボタン",
      },
      {
        title: "改善バックログ — 優先順位を決める",
        description: `確認済みの要望を${pt.navBacklog}に移し、詳細化します。${pt.rolePO}が業務負荷点数と優先順位を設定します。`,
        operation: `${pt.navBacklog} → PBI追加、ドラッグで並び替え`,
      },
      {
        title: "改善スプリント計画 — 次にやることを決める",
        description: `1〜4週間の${pt.navSprints}を作成し、${pt.navBacklog}の上位アイテムを取り込みます。キャパシティ（チームの処理能力）を設定し、過負荷にならないよう調整します。`,
        operation: `${pt.navSprints} → 新規作成 → バックログから取り込み`,
      },
      {
        title: "改善実行 — 改善施策を進める",
        description: "改善項目をタスクに分解し、担当者をアサイン。ステータスをクリックで Todo → 進行中 → 完了 と更新します。",
        operation: "各タスクのステータスアイコンをクリック",
      },
      {
        title: "効果検証＆振り返り — 改善効果を確認する",
        description: "改善スプリント終了時に効果検証と振り返りメモ（KPT）を記録。改善前後の数値を比較し、次のスプリントに活かします。",
      },
      {
        title: "標準化・展開 — 成果を展開する",
        description: "効果が確認された改善施策を標準作業手順書（SOP）に落とし込み、他のラインや工程にも水平展開します。",
        operation: `サイドバー → ${pt.navReleases} → 作成`,
      },
    ],
    en: [
      {
        title: "Kaizen Goal — Define the Target State",
        description: "At the start of the project, set the ultimate improvement goal the team aims for. The KAIZEN Goal is the 'North Star' guiding all activities. KAIZEN Backlog priorities are also determined based on this goal.",
        operation: "Dashboard → Product Goal → Add Goal",
        hint: "Goals should ideally be specific and measurable. Example: 'Reduce defect rate by 50%' or 'Shorten changeover time to under 10 minutes'",
      },
      {
        title: "Improvement Requests — Gather Shop Floor Insights",
        description: "Any team member can submit improvement requests and observations from the shop floor. Photos and documents can be attached.",
        operation: `Sidebar → ${pt.navIcebox} → Add Request button`,
        hint: "Feel free to post freely. No screening is needed at this stage.",
      },
      {
        title: "Kaizen Owner Review — Screen Requests",
        description: `The ${pt.rolePO} (Kaizen Owner) reviews requests in ${pt.navIcebox} and classifies them as Confirmed or Frozen.`,
        operation: "Status change button on the right side of each card",
      },
      {
        title: "KAIZEN Backlog — Set Priorities",
        description: `Move confirmed requests to the ${pt.navBacklog} and refine them. The ${pt.rolePO} sets effort points and priorities.`,
        operation: `${pt.navBacklog} → Add PBI, drag to reorder`,
      },
      {
        title: "KAIZEN Sprint Planning — Decide What to Do Next",
        description: `Create a 1-4 week ${pt.navSprints}, and pull in top items from the ${pt.navBacklog}. Set the capacity (team throughput) and adjust to avoid overload.`,
        operation: `${pt.navSprints} → Create New → Pull from Backlog`,
      },
      {
        title: "Execute Improvements — Carry Out Kaizen Measures",
        description: "Break improvement items into tasks and assign owners. Click the status to update: Todo → In Progress → Done.",
        operation: "Click the status icon on each task",
      },
      {
        title: "Verify & Reflect — Confirm Improvement Effects",
        description: "At the end of the KAIZEN Sprint, record effect verification and retrospective notes (KPT). Compare before-and-after metrics and apply learnings to the next sprint.",
      },
      {
        title: "Standardize & Deploy — Roll Out Results",
        description: "Incorporate verified improvements into Standard Operating Procedures (SOPs) and deploy horizontally to other lines and processes.",
        operation: `Sidebar → ${pt.navReleases} → Create`,
      },
    ],
    id: [
      {
        title: "Tujuan Kaizen — Tentukan Target",
        description: "Di awal proyek, tetapkan tujuan perbaikan akhir yang ingin dicapai tim. Tujuan KAIZEN adalah 'Bintang Utara' yang memandu semua aktivitas. Prioritas KAIZEN Backlog juga ditentukan berdasarkan tujuan ini.",
        operation: "Dashboard → Product Goal → Tambah Goal",
        hint: "Tujuan idealnya spesifik dan terukur. Contoh: 'Kurangi tingkat cacat 50%' atau 'Persingkat waktu pergantian menjadi di bawah 10 menit'",
      },
      {
        title: "Permintaan Perbaikan — Kumpulkan Temuan Lapangan",
        description: "Setiap anggota tim dapat mengirimkan permintaan perbaikan dan pengamatan dari lapangan. Foto dan dokumen dapat dilampirkan.",
        operation: `Sidebar → ${pt.navIcebox} → Tombol Tambah Permintaan`,
        hint: "Silakan posting dengan bebas. Tidak perlu penyaringan di tahap ini.",
      },
      {
        title: "Tinjauan Kaizen Owner — Saring Permintaan",
        description: `${pt.rolePO} (Kaizen Owner) meninjau permintaan di ${pt.navIcebox} dan mengklasifikasikannya sebagai Dikonfirmasi atau Dibekukan.`,
        operation: "Tombol perubahan status di sisi kanan setiap kartu",
      },
      {
        title: "KAIZEN Backlog — Tetapkan Prioritas",
        description: `Pindahkan permintaan yang dikonfirmasi ke ${pt.navBacklog} dan perinci. ${pt.rolePO} menetapkan poin upaya dan prioritas.`,
        operation: `${pt.navBacklog} → Tambah PBI, seret untuk mengurutkan`,
      },
      {
        title: "Perencanaan KAIZEN Sprint — Putuskan Apa yang Dilakukan Selanjutnya",
        description: `Buat ${pt.navSprints} 1-4 minggu, dan tarik item teratas dari ${pt.navBacklog}. Atur kapasitas (throughput tim) dan sesuaikan untuk menghindari kelebihan beban.`,
        operation: `${pt.navSprints} → Buat Baru → Tarik dari Backlog`,
      },
      {
        title: "Jalankan Perbaikan — Laksanakan Langkah Kaizen",
        description: "Pecah item perbaikan menjadi tugas dan tetapkan penanggung jawab. Klik status untuk memperbarui: Todo → Sedang Berlangsung → Selesai.",
        operation: "Klik ikon status pada setiap tugas",
      },
      {
        title: "Verifikasi & Refleksi — Konfirmasi Efek Perbaikan",
        description: "Di akhir KAIZEN Sprint, catat verifikasi efek dan catatan retrospektif (KPT). Bandingkan metrik sebelum dan sesudah dan terapkan pembelajaran ke sprint berikutnya.",
      },
      {
        title: "Standardisasi & Penyebaran — Sebarkan Hasil",
        description: "Masukkan perbaikan yang terverifikasi ke dalam Prosedur Operasi Standar (SOP) dan sebarkan secara horizontal ke lini dan proses lainnya.",
        operation: `Sidebar → ${pt.navReleases} → Buat`,
      },
    ],
  }
}
