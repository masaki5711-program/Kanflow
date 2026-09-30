import type { Language } from "@/lib/i18n"
import type { StepText } from "./guide-steps"

/** Getting-started steps for software (Scrum) projects. */
export const SOFTWARE_STEPS: Record<Language, StepText[]> = {
  ja: [
    {
      title: "プロダクトゴール — 目指す姿を定める",
      description: "プロジェクト開始時に、チームが目指すプロダクトの最終的な目標を設定します。プロダクトゴールは全ての活動の方向性を示す「北極星」です。バックログの優先順位もゴールに基づいて判断します。",
      operation: "ダッシュボード → プロダクトゴール → ゴール追加",
      hint: "ゴールは具体的で測定可能なものが理想的です。例:「顧客満足度を20%向上」「月間アクティブユーザー1000人達成」",
    },
    {
      title: "IceBox — アイデアを集める",
      description: "チームメンバーの誰でも改善要望やアイデアを投稿できます。写真や資料も添付可能です。",
      operation: "サイドバーの IceBox → 要望を追加 ボタン",
      hint: "気軽に投稿してください。この段階では精査は不要です。",
    },
    {
      title: "POレビュー — アイデアを精査する",
      description: "PO（プロダクトオーナー）がIceBoxの要望をレビューし、確認済み・凍結に分類します。",
      operation: "各カードの右側のステータス変更ボタン",
    },
    {
      title: "バックログ — 優先順位を決める",
      description: "確認済みの要望をプロダクトバックログに移し、ユーザーストーリー形式で詳細化。POが業務負荷点数と優先順位を設定します。",
      operation: "バックログ → PBI追加、ドラッグで並び替え",
      hint: "ユーザーストーリーの書き方：「＜誰が＞として、＜何を＞したい。それは＜なぜ＞だからだ。」",
    },
    {
      title: "スプリントプランニング — このスプリントの「なぜ・何を・どのように」を決める",
      description: "スプリント開始時に、スプリントゴールの定義、取り組むPBIの選択、作業計画の作成を行います。1〜4週間の固定タイムボックスを設定し、キャパシティ（チームの処理能力）を踏まえて過負荷を避けます。",
      operation: "スプリント → 新規スプリント → PBから取り込み",
      hint: "参加者：スクラムチーム全体（PO・SM・開発者）。必要に応じて社内の有識者を外部アドバイザーとして招待可能。タイムボックス：1週スプリント=最大2時間、4週=最大8時間。",
    },
    {
      title: "スプリント実行＆デイリースクラム — 毎日の検査と適応",
      description: "PBIをタスクに分解し、担当者をアサイン。ステータスをクリックで Todo → 進行中 → 完了 と更新します。毎日同じ時間・場所で最大15分のデイリースクラムを開き、スプリントゴールに対する進捗を検査し、次の24時間のプランを調整します。",
      operation: "各タスクのステータスアイコンをクリック／スプリントカード内「デイリースクラム」欄に記録",
      hint: "デイリースクラム参加者：開発者。PO・SMが開発者を兼任している場合は開発者として参加、兼任していない場合は原則必須ではなくオブザーバーとして聞くことが可能。",
    },
    {
      title: "スプリントレビュー — 成果をステークホルダーと検査",
      description: "スプリント終盤に、作成したインクリメント（成果物）をステークホルダーとともに検査する**ワーキングセッション**。デモを実施しフィードバックを獲得、市場・環境の変化を議論してプロダクトバックログを更新します。",
      operation: "スプリントを「レビュー」ステータスへ遷移 → レビューコメントを記入",
      hint: "参加者：スクラムチーム全体 ＋ 主要なステークホルダー（顧客・関係部署・経営層など）。POが適切な参加者を招待。タイムボックス：1週=最大1h、4週=最大4h。",
    },
    {
      title: "スプリントレトロスペクティブ — チームが次のスプリントに向けて改善を計画",
      description: "スプリントレビューの後に、チーム自身のために行う改善会議。人・関係性・プロセス・ツールの観点で、うまくいったこと／課題だったことを洗い出し、KPT（Keep/Problem/Try）で**具体的な改善アクション**を決めます。",
      operation: "スプリントを「完了」へ遷移 → KPT ダイアログで K / P / T を記入して保存（自動アーカイブ）",
      hint: "参加者：スクラムチーム全体（PO・SM・開発者）のみ。ステークホルダーは原則不参加。タイムボックス：1週=最大45分、4週=最大3h。",
    },
    {
      title: "リリース — 成果を届ける",
      description: "完了したPBIをリリースバックログに取り込み、バージョン管理してリリースします。",
      operation: "サイドバー → リリース → リリース作成",
    },
  ],
  en: [
    {
      title: "Product Goal — Define the Target State",
      description: "At the start of the project, set the ultimate goal the team aims for with the product. The Product Goal is the 'North Star' guiding all activities. Backlog priorities are also determined based on this goal.",
      operation: "Dashboard → Product Goal → Add Goal",
      hint: "Goals should ideally be specific and measurable. Example: 'Improve customer satisfaction by 20%' or 'Reach 1,000 monthly active users'",
    },
    {
      title: "IceBox — Gather Ideas",
      description: "Any team member can submit improvement requests and ideas. Photos and documents can be attached.",
      operation: "Sidebar → IceBox → Add Request button",
      hint: "Feel free to post freely. No screening is needed at this stage.",
    },
    {
      title: "PO Review — Screen Ideas",
      description: "The PO (Product Owner) reviews requests in the IceBox and classifies them as Confirmed or Frozen.",
      operation: "Status change button on the right side of each card",
    },
    {
      title: "Backlog — Set Priorities",
      description: "Move confirmed requests to the Product Backlog and refine them as user stories. The PO sets effort points and priorities.",
      operation: "Backlog → Add PBI, drag to reorder",
      hint: "How to write a user story: 'As a [who], I want [what], so that [why].'",
    },
    {
      title: "Sprint Planning — Decide the Why / What / How of this Sprint",
      description: "At the start of the Sprint, define the Sprint Goal, pick the PBIs to tackle, and build the plan for how to complete them. Set a fixed 1-4 week timebox, and size the work against team capacity to avoid overload.",
      operation: "Sprints → New Sprint → Pull from PB",
      hint: "Attendees: the whole Scrum Team (PO, SM, Developers). Subject-matter advisors can be invited when useful. Timebox: up to 2h for a 1-week Sprint, up to 8h for a 4-week Sprint.",
    },
    {
      title: "Sprint Execution & Daily Scrum — Inspect & adapt every day",
      description: "Break PBIs into tasks and assign owners. Click the status to update: Todo → In Progress → Done. Each day hold a 15-minute Daily Scrum at the same time/place to inspect progress toward the Sprint Goal and adjust the plan for the next 24 hours.",
      operation: "Click the status icon on each task / record notes in each sprint card's Daily Scrum section",
      hint: "Daily Scrum attendees: the Developers. A PO or SM who is also playing a Developer role attends as a Developer; otherwise they are not required but may listen in as observers.",
    },
    {
      title: "Sprint Review — Inspect the increment with stakeholders",
      description: "Near the end of the Sprint, inspect the increment with stakeholders in a working session. Demo the outcome, gather feedback, discuss market/environment changes, and update the Product Backlog for what comes next.",
      operation: "Move the sprint to Review status → record the review comment",
      hint: "Attendees: the whole Scrum Team + key stakeholders (customers, partners, leadership). The PO invites the right stakeholders. Timebox: up to 1h for a 1-week Sprint, up to 4h for 4-week.",
    },
    {
      title: "Sprint Retrospective — Plan concrete improvements for next Sprint",
      description: "The team's improvement meeting held after the Sprint Review. Inspect how the Sprint went across people, relationships, process, and tools. Surface what worked and what didn't, then use KPT (Keep/Problem/Try) to agree on concrete improvement actions.",
      operation: "Move the sprint to Done → fill in K / P / T in the dialog and save (auto-archives)",
      hint: "Attendees: the whole Scrum Team only (PO, SM, Developers). Stakeholders are typically not present. Timebox: up to 45min for 1-week, up to 3h for 4-week.",
    },
    {
      title: "Release — Deliver Results",
      description: "Pull completed PBIs into the Release Backlog, manage versions, and release.",
      operation: "Sidebar → Releases → Create Release",
    },
  ],
  id: [
    {
      title: "Product Goal — Tentukan Target",
      description: "Di awal proyek, tetapkan tujuan akhir yang ingin dicapai tim untuk produk. Product Goal adalah 'Bintang Utara' yang memandu semua aktivitas. Prioritas backlog juga ditentukan berdasarkan tujuan ini.",
      operation: "Dashboard → Product Goal → Tambah Goal",
      hint: "Tujuan idealnya spesifik dan terukur. Contoh: 'Tingkatkan kepuasan pelanggan 20%' atau 'Capai 1.000 pengguna aktif bulanan'",
    },
    {
      title: "IceBox — Kumpulkan Ide",
      description: "Setiap anggota tim dapat mengirimkan permintaan perbaikan dan ide. Foto dan dokumen dapat dilampirkan.",
      operation: "Sidebar → IceBox → Tombol Tambah Permintaan",
      hint: "Silakan posting dengan bebas. Tidak perlu penyaringan di tahap ini.",
    },
    {
      title: "Tinjauan PO — Saring Ide",
      description: "PO (Product Owner) meninjau permintaan di IceBox dan mengklasifikasikannya sebagai Dikonfirmasi atau Dibekukan.",
      operation: "Tombol perubahan status di sisi kanan setiap kartu",
    },
    {
      title: "Backlog — Tetapkan Prioritas",
      description: "Pindahkan permintaan yang dikonfirmasi ke Product Backlog dan perinci sebagai user story. PO menetapkan poin upaya dan prioritas.",
      operation: "Backlog → Tambah PBI, seret untuk mengurutkan",
      hint: "Cara menulis user story: 'Sebagai [siapa], saya ingin [apa], sehingga [mengapa].'",
    },
    {
      title: "Sprint Planning — Tentukan Mengapa/Apa/Bagaimana Sprint ini",
      description: "Di awal Sprint, tetapkan Sprint Goal, pilih PBI yang akan dikerjakan, dan susun rencana penyelesaiannya. Atur timebox tetap 1-4 minggu dan ukur pekerjaan sesuai kapasitas tim untuk menghindari kelebihan beban.",
      operation: "Sprint → Sprint Baru → Tarik dari PB",
      hint: "Peserta: seluruh Scrum Team (PO, SM, Developer). Pakar eksternal dapat diundang bila perlu. Timebox: maks 2 jam untuk sprint 1 minggu, maks 8 jam untuk 4 minggu.",
    },
    {
      title: "Eksekusi Sprint & Daily Scrum — Periksa & sesuaikan setiap hari",
      description: "Pecah PBI menjadi tugas dan tetapkan penanggung jawab. Klik status: Todo → Sedang Berlangsung → Selesai. Setiap hari adakan Daily Scrum 15 menit pada waktu/tempat yang sama untuk memeriksa kemajuan menuju Sprint Goal dan menyesuaikan rencana 24 jam berikutnya.",
      operation: "Klik ikon status pada setiap tugas / catat di kolom Daily Scrum pada kartu sprint",
      hint: "Peserta Daily Scrum: Developer. Jika PO/SM juga berperan sebagai Developer, mereka hadir sebagai Developer; jika tidak, tidak wajib hadir namun boleh menyimak.",
    },
    {
      title: "Sprint Review — Periksa increment bersama pemangku kepentingan",
      description: "Menjelang akhir Sprint, periksa increment bersama pemangku kepentingan dalam sesi kerja. Demonstrasikan hasil, kumpulkan umpan balik, diskusikan perubahan pasar/lingkungan, dan perbarui Product Backlog untuk langkah berikutnya.",
      operation: "Pindahkan sprint ke status Review → isi komentar tinjauan",
      hint: "Peserta: seluruh Scrum Team + pemangku kepentingan utama (pelanggan, mitra, manajemen). PO mengundang yang tepat. Timebox: maks 1 jam untuk 1 minggu, maks 4 jam untuk 4 minggu.",
    },
    {
      title: "Sprint Retrospective — Rencanakan aksi perbaikan konkret",
      description: "Rapat perbaikan tim setelah Sprint Review. Periksa bagaimana Sprint berjalan dari aspek orang, hubungan, proses, dan alat. Munculkan apa yang berhasil dan yang bermasalah, lalu gunakan KPT (Keep/Problem/Try) untuk menyepakati aksi perbaikan konkret.",
      operation: "Pindahkan sprint ke Selesai → isi K / P / T di dialog lalu simpan (otomatis di-arsipkan)",
      hint: "Peserta: hanya seluruh Scrum Team (PO, SM, Developer). Pemangku kepentingan biasanya tidak hadir. Timebox: maks 45 menit untuk 1 minggu, maks 3 jam untuk 4 minggu.",
    },
    {
      title: "Rilis — Serahkan Hasil",
      description: "Tarik PBI yang selesai ke Release Backlog, kelola versi, dan rilis.",
      operation: "Sidebar → Rilis → Buat Rilis",
    },
  ],
}
