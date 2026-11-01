/**
 * i18n domain: 受入基準 checklist of the PBI detail (W5; components/acceptance-criteria/) —
 * items with stable ids (PBI-12/AC-2), Given / When / Then or free text, and the evidence kind
 * (W12): test / inspection record / measurement / document approval.
 * Add a key to the interface AND to ja / en / id below (compile error otherwise).
 */
export interface AcceptanceCriteriaTranslations {
  pbiAcEmpty: string
  pbiAcLoadFailed: string
  pbiAcAdd: string
  pbiAcGiven: string
  pbiAcWhen: string
  pbiAcThen: string
  pbiAcText: string
  pbiAcTextHint: string
  pbiAcStructuredHint: string
  pbiAcEvidence: string
  pbiAcEvidenceNone: string
  pbiAcEvidenceTest: string
  pbiAcEvidenceInspection: string
  pbiAcEvidenceMeasurement: string
  pbiAcEvidenceApproval: string
  pbiAcEvidenceNotSet: string
  pbiAcEditLabel: string
  pbiAcDeleteLabel: string
  pbiAcSaved: string
  pbiAcSaveFailed: string
  pbiAcDeleted: string
  pbiAcDeleteFailed: string
  pbiAcDeleteConfirmTitle: string
  pbiAcDeleteConfirmMessage: string
  pbiAcContentRequired: string
  pbiAcLegacyTitle: string
  pbiAcLegacyHint: string
}

export const ja: AcceptanceCriteriaTranslations = {
  pbiAcEmpty: "受入基準はまだありません",
  pbiAcLoadFailed: "受入基準を読み込めませんでした",
  pbiAcAdd: "受入基準を追加",
  pbiAcGiven: "前提（Given）",
  pbiAcWhen: "操作（When）",
  pbiAcThen: "結果（Then）",
  pbiAcText: "自由記述",
  pbiAcTextHint: "前提・操作・結果に分けにくいときは、ここに書いてください",
  pbiAcStructuredHint: "前提・操作・結果は、どれも空でかまいません。どれか 1 つ（または自由記述）があれば保存できます",
  pbiAcEvidence: "確認の方法",
  pbiAcEvidenceNone: "未定",
  pbiAcEvidenceTest: "テスト",
  pbiAcEvidenceInspection: "検査記録",
  pbiAcEvidenceMeasurement: "測定値（理論値との比較）",
  pbiAcEvidenceApproval: "文書の承認",
  pbiAcEvidenceNotSet: "確認の方法は未定",
  pbiAcEditLabel: "{id} を編集",
  pbiAcDeleteLabel: "{id} を削除",
  pbiAcSaved: "受入基準を保存しました",
  pbiAcSaveFailed: "受入基準を保存できませんでした",
  pbiAcDeleted: "受入基準を削除しました",
  pbiAcDeleteFailed: "受入基準を削除できませんでした",
  pbiAcDeleteConfirmTitle: "受入基準を削除しますか？",
  pbiAcDeleteConfirmMessage: "{id} を削除します。この番号は、あとで別の項目に使われません。",
  pbiAcContentRequired: "前提・操作・結果・自由記述のどれか 1 つを入力してください",
  pbiAcLegacyTitle: "旧: 自由記述の受入基準（廃止予定・読み取り専用）",
  pbiAcLegacyHint: "上の項目に分けて管理します。この欄は編集できなくなる予定です",
}

export const en: AcceptanceCriteriaTranslations = {
  pbiAcEmpty: "No acceptance criteria yet",
  pbiAcLoadFailed: "Could not load the acceptance criteria",
  pbiAcAdd: "Add acceptance criterion",
  pbiAcGiven: "Given",
  pbiAcWhen: "When",
  pbiAcThen: "Then",
  pbiAcText: "Free text",
  pbiAcTextHint: "Use this when it does not fit Given / When / Then",
  pbiAcStructuredHint: "Given, When and Then are all optional. Fill in any one of them (or the free text) to save",
  pbiAcEvidence: "How it is proven",
  pbiAcEvidenceNone: "Not decided",
  pbiAcEvidenceTest: "Test",
  pbiAcEvidenceInspection: "Inspection record",
  pbiAcEvidenceMeasurement: "Measurement (vs. theoretical value)",
  pbiAcEvidenceApproval: "Document approval",
  pbiAcEvidenceNotSet: "Evidence not decided",
  pbiAcEditLabel: "Edit {id}",
  pbiAcDeleteLabel: "Delete {id}",
  pbiAcSaved: "Acceptance criterion saved",
  pbiAcSaveFailed: "Could not save the acceptance criterion",
  pbiAcDeleted: "Acceptance criterion deleted",
  pbiAcDeleteFailed: "Could not delete the acceptance criterion",
  pbiAcDeleteConfirmTitle: "Delete this acceptance criterion?",
  pbiAcDeleteConfirmMessage: "{id} will be deleted. Its number will never be given to another item.",
  pbiAcContentRequired: "Fill in at least one of Given, When, Then or the free text",
  pbiAcLegacyTitle: "Old: free-text acceptance criteria (deprecated, read-only)",
  pbiAcLegacyHint: "Keep the criteria as the items above. This field will stop being editable",
}

export const id: AcceptanceCriteriaTranslations = {
  pbiAcEmpty: "Belum ada kriteria penerimaan",
  pbiAcLoadFailed: "Kriteria penerimaan tidak dapat dimuat",
  pbiAcAdd: "Tambah kriteria penerimaan",
  pbiAcGiven: "Prasyarat (Given)",
  pbiAcWhen: "Tindakan (When)",
  pbiAcThen: "Hasil (Then)",
  pbiAcText: "Teks bebas",
  pbiAcTextHint: "Gunakan ini jika tidak cocok dengan Given / When / Then",
  pbiAcStructuredHint: "Given, When, dan Then boleh dikosongkan. Isi salah satunya (atau teks bebas) untuk menyimpan",
  pbiAcEvidence: "Cara pembuktian",
  pbiAcEvidenceNone: "Belum ditentukan",
  pbiAcEvidenceTest: "Pengujian",
  pbiAcEvidenceInspection: "Catatan inspeksi",
  pbiAcEvidenceMeasurement: "Pengukuran (dibanding nilai teoretis)",
  pbiAcEvidenceApproval: "Persetujuan dokumen",
  pbiAcEvidenceNotSet: "Cara pembuktian belum ditentukan",
  pbiAcEditLabel: "Ubah {id}",
  pbiAcDeleteLabel: "Hapus {id}",
  pbiAcSaved: "Kriteria penerimaan disimpan",
  pbiAcSaveFailed: "Kriteria penerimaan tidak dapat disimpan",
  pbiAcDeleted: "Kriteria penerimaan dihapus",
  pbiAcDeleteFailed: "Kriteria penerimaan tidak dapat dihapus",
  pbiAcDeleteConfirmTitle: "Hapus kriteria penerimaan ini?",
  pbiAcDeleteConfirmMessage: "{id} akan dihapus. Nomor ini tidak akan diberikan kepada butir lain.",
  pbiAcContentRequired: "Isi setidaknya salah satu dari Given, When, Then, atau teks bebas",
  pbiAcLegacyTitle: "Lama: kriteria penerimaan teks bebas (akan dihentikan, hanya baca)",
  pbiAcLegacyHint: "Kelola sebagai butir di atas. Kolom ini akan tidak dapat diubah lagi",
}
