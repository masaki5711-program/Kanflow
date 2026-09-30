/**
 * i18n domain: Project dashboard, attachments and folders.
 * Add a key to the interface AND to ja / en / id below (compile error otherwise).
 */
export interface DashboardTranslations {
  // Dashboard
  dashboardTitle: string
  dashboardActiveSprint: string
  dashboardNoActiveSprint: string
  dashboardOpenSprints: string
  dashboardGoal: string
  dashboardPeriod: string
  dashboardCapacity: string
  dashboardOverview: string
  dashboardProjectInfo: string
  dashboardDescription: string
  dashboardDescriptionPlaceholder: string
  dashboardProductGoals: string
  dashboardAddGoal: string
  dashboardNoGoals: string
  dashboardAttachments: string
  dashboardUploadFile: string
  dashboardDownload: string
  dashboardNoAttachments: string
  dashboardDeleteAttachmentConfirm: string
  // Folder
  folderNew: string
  folderName: string
  folderDelete: string
  folderDeleteConfirm: string
  folderNoFiles: string
  folderMoveTo: string
  folderUnfiled: string
  folderEditName: string
  folderDeleteTitle: string
  dashboardProgressSetByPo: string
  dashboardProgressEditHint: string
  dashboardProgressPercent: string
  dashboardEditGoal: string
  dashboardDragHandle: string
  dashboardDragHint: string
  dashboardMoveUp: string
  dashboardMoveDown: string
  dashboardUploading: string
  dashboardUploadFailed: string
  dashboardDeleteFailed: string
  dashboardMoveFailed: string
  dashboardDownloadNamed: string
  dashboardMediaFullscreen: string
  dashboardMediaFullscreenFailed: string
  dashboardMediaPrev: string
  dashboardMediaNext: string
  dashboardMediaVideoUnsupported: string
  dashboardMediaNoPreview: string
  folderDropZoneHint: string
  folderAddSubfolder: string
  folderChangeParent: string
  folderRoot: string
  folderExpand: string
  folderCollapse: string
  folderCreateIn: string
}

export const ja: DashboardTranslations = {
  dashboardTitle: "ダッシュボード",
  dashboardActiveSprint: "実行中スプリント",
  dashboardNoActiveSprint: "実行中のスプリントはありません",
  dashboardOpenSprints: "スプリント画面を開く",
  dashboardGoal: "ゴール",
  dashboardPeriod: "期間",
  dashboardCapacity: "キャパシティ",
  dashboardOverview: "プロジェクト概要",
  dashboardProjectInfo: "プロジェクト情報",
  dashboardDescription: "プロジェクトの目的・概要",
  dashboardDescriptionPlaceholder: "このプロジェクトの目的や背景を記入してください",
  dashboardProductGoals: "プロダクトゴール",
  dashboardAddGoal: "ゴール追加",
  dashboardNoGoals: "プロダクトゴールが設定されていません",
  dashboardAttachments: "添付ファイル",
  dashboardUploadFile: "ファイルをアップロード",
  dashboardDownload: "ダウンロード",
  dashboardNoAttachments: "添付ファイルはありません",
  dashboardDeleteAttachmentConfirm: "このファイルを削除しますか？",
  folderNew: "+ フォルダ",
  folderName: "フォルダ名",
  folderDelete: "フォルダを削除",
  folderDeleteConfirm: "このフォルダを削除しますか？（ファイルは未分類に移動されます）",
  folderNoFiles: "ファイルなし",
  folderMoveTo: "移動...",
  folderUnfiled: "未分類",
  folderEditName: "フォルダ名を編集",
  folderDeleteTitle: "フォルダを削除",
  dashboardProgressSetByPo: "（PO が設定）",
  dashboardProgressEditHint: "クリックして編集",
  dashboardProgressPercent: "進捗率（%）",
  dashboardEditGoal: "ゴールを編集",
  dashboardDragHandle: "ドラッグして移動・並び替え",
  dashboardDragHint: "ドラッグ、または各行の ↑↓ ボタンと「移動...」メニューで並び替え・移動できます",
  dashboardMoveUp: "上へ移動",
  dashboardMoveDown: "下へ移動",
  dashboardUploading: "アップロード中...",
  dashboardUploadFailed: "アップロードに失敗しました",
  dashboardDeleteFailed: "削除に失敗しました",
  dashboardMoveFailed: "移動に失敗しました",
  dashboardDownloadNamed: "{name} をダウンロード",
  dashboardMediaFullscreen: "全画面表示 (F)",
  dashboardMediaFullscreenFailed: "全画面表示に切り替えられませんでした",
  dashboardMediaPrev: "前へ (←)",
  dashboardMediaNext: "次へ (→)",
  dashboardMediaVideoUnsupported: "このブラウザは動画の再生に対応していません。",
  dashboardMediaNoPreview: "プレビューできません。ダウンロードしてご確認ください。",
  folderDropZoneHint: "上端=前に挿入／中央=中に入れる／下端=後ろに挿入",
  folderAddSubfolder: "サブフォルダを追加",
  folderChangeParent: "親フォルダを変更...",
  folderRoot: "（最上位）",
  folderExpand: "フォルダを開く",
  folderCollapse: "フォルダを閉じる",
  folderCreateIn: "作成先: {name}",
}

export const en: DashboardTranslations = {
  dashboardTitle: "Dashboard",
  dashboardActiveSprint: "Active Sprint",
  dashboardNoActiveSprint: "No active sprint",
  dashboardOpenSprints: "Go to Sprints",
  dashboardGoal: "Goal",
  dashboardPeriod: "Period",
  dashboardCapacity: "Capacity",
  dashboardOverview: "Project Overview",
  dashboardProjectInfo: "Project Information",
  dashboardDescription: "Project Purpose & Overview",
  dashboardDescriptionPlaceholder: "Describe the purpose and background of this project",
  dashboardProductGoals: "Product Goals",
  dashboardAddGoal: "Add Goal",
  dashboardNoGoals: "No product goals set",
  dashboardAttachments: "Attachments",
  dashboardUploadFile: "Upload File",
  dashboardDownload: "Download",
  dashboardNoAttachments: "No attachments",
  dashboardDeleteAttachmentConfirm: "Delete this file?",
  folderNew: "+ Folder",
  folderName: "Folder name",
  folderDelete: "Delete folder",
  folderDeleteConfirm: "Delete this folder? Files will be moved to unfiled.",
  folderNoFiles: "No files",
  folderMoveTo: "Move...",
  folderUnfiled: "Unfiled",
  folderEditName: "Edit folder name",
  folderDeleteTitle: "Delete folder",
  dashboardProgressSetByPo: "(set by PO)",
  dashboardProgressEditHint: "Click to edit",
  dashboardProgressPercent: "Progress (%)",
  dashboardEditGoal: "Edit goal",
  dashboardDragHandle: "Drag to move or reorder",
  dashboardDragHint: "Drag rows, or use the ↑↓ buttons and the \"Move...\" menu, to reorder or move files",
  dashboardMoveUp: "Move up",
  dashboardMoveDown: "Move down",
  dashboardUploading: "Uploading...",
  dashboardUploadFailed: "Upload failed",
  dashboardDeleteFailed: "Delete failed",
  dashboardMoveFailed: "Move failed",
  dashboardDownloadNamed: "Download {name}",
  dashboardMediaFullscreen: "Full screen (F)",
  dashboardMediaFullscreenFailed: "Could not switch to full screen",
  dashboardMediaPrev: "Previous (←)",
  dashboardMediaNext: "Next (→)",
  dashboardMediaVideoUnsupported: "Your browser cannot play this video.",
  dashboardMediaNoPreview: "Preview not available — please download the file.",
  folderDropZoneHint: "Top edge: insert before / Center: move inside / Bottom edge: insert after",
  folderAddSubfolder: "Add subfolder",
  folderChangeParent: "Change parent folder...",
  folderRoot: "(Top level)",
  folderExpand: "Expand folder",
  folderCollapse: "Collapse folder",
  folderCreateIn: "Create in: {name}",
}

export const id: DashboardTranslations = {
  dashboardTitle: "Dasbor",
  dashboardActiveSprint: "Sprint Aktif",
  dashboardNoActiveSprint: "Tidak ada sprint aktif",
  dashboardOpenSprints: "Buka halaman Sprint",
  dashboardGoal: "Tujuan",
  dashboardPeriod: "Periode",
  dashboardCapacity: "Kapasitas",
  dashboardOverview: "Ringkasan Proyek",
  dashboardProjectInfo: "Informasi Proyek",
  dashboardDescription: "Tujuan & Ringkasan Proyek",
  dashboardDescriptionPlaceholder: "Jelaskan tujuan dan latar belakang proyek ini",
  dashboardProductGoals: "Tujuan Produk",
  dashboardAddGoal: "Tambah Tujuan",
  dashboardNoGoals: "Belum ada tujuan produk",
  dashboardAttachments: "Lampiran",
  dashboardUploadFile: "Unggah File",
  dashboardDownload: "Unduh",
  dashboardNoAttachments: "Tidak ada lampiran",
  dashboardDeleteAttachmentConfirm: "Hapus file ini?",
  folderNew: "+ Folder",
  folderName: "Nama folder",
  folderDelete: "Hapus folder",
  folderDeleteConfirm: "Hapus folder ini? File akan dipindahkan ke tidak berkategori.",
  folderNoFiles: "Tidak ada file",
  folderMoveTo: "Pindah...",
  folderUnfiled: "Tidak Berkategori",
  folderEditName: "Edit nama folder",
  folderDeleteTitle: "Hapus folder",
  dashboardProgressSetByPo: "(diatur oleh PO)",
  dashboardProgressEditHint: "Klik untuk mengedit",
  dashboardProgressPercent: "Progres (%)",
  dashboardEditGoal: "Edit tujuan",
  dashboardDragHandle: "Seret untuk memindahkan atau mengurutkan ulang",
  dashboardDragHint: "Seret baris, atau gunakan tombol ↑↓ dan menu \"Pindah...\", untuk mengurutkan ulang atau memindahkan file",
  dashboardMoveUp: "Pindah ke atas",
  dashboardMoveDown: "Pindah ke bawah",
  dashboardUploading: "Mengunggah...",
  dashboardUploadFailed: "Gagal mengunggah",
  dashboardDeleteFailed: "Gagal menghapus",
  dashboardMoveFailed: "Gagal memindahkan",
  dashboardDownloadNamed: "Unduh {name}",
  dashboardMediaFullscreen: "Layar penuh (F)",
  dashboardMediaFullscreenFailed: "Tidak dapat beralih ke layar penuh",
  dashboardMediaPrev: "Sebelumnya (←)",
  dashboardMediaNext: "Berikutnya (→)",
  dashboardMediaVideoUnsupported: "Browser Anda tidak dapat memutar video ini.",
  dashboardMediaNoPreview: "Pratinjau tidak tersedia — silakan unduh file.",
  folderDropZoneHint: "Tepi atas: sisipkan sebelum / Tengah: masukkan ke dalam / Tepi bawah: sisipkan sesudah",
  folderAddSubfolder: "Tambah subfolder",
  folderChangeParent: "Ubah folder induk...",
  folderRoot: "(Tingkat teratas)",
  folderExpand: "Buka folder",
  folderCollapse: "Tutup folder",
  folderCreateIn: "Dibuat di: {name}",
}
