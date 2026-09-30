/**
 * i18n domain: My profile + personal fixed tasks.
 * Add a key to the interface AND to ja / en / id below (compile error otherwise).
 */
export interface MeTranslations {
  myProfileTitle: string
  myProfileMenu: string
  myProfileSaved: string
  myProfileEmployeeNumber: string
  myProfileDepartment: string
  myProfilePasswordSection: string
  myProfileCurrentPassword: string
  myProfileNewPassword: string
  myProfileNewPasswordConfirm: string
  myProfilePasswordMismatch: string
  myProfilePasswordChanged: string
  myProfilePasswordWrong: string
  // Fixed Tasks (personal task templates)
  fixedTasksTitle: string
  fixedTasksDesc: string
  fixedTasksManage: string
  fixedTasksAdd: string
  fixedTasksEmpty: string
  fixedTasksNamePlaceholder: string
  fixedTasksSelectPlaceholder: string
  fixedTasksApplyFromTemplate: string
  fixedTasksGroupNamePlaceholder: string
  fixedTasksItemNamePlaceholder: string
  fixedTasksItemEmpty: string
  fixedTasksBulkAdd: string
  fixedTasksBulkAddPreview: string
  myProfileEmailChangeHint: string
  myProfileBasicInfo: string
  fixedTasksGroupNameLabel: string
  fixedTasksItemNameLabel: string
  fixedTasksExpand: string
  fixedTasksCollapse: string
  fixedTasksItemCount: string
  fixedTasksDeleteGroupConfirm: string
  fixedTasksDeleteItemConfirm: string
  fixedTasksLoadFailed: string
}

export const ja: MeTranslations = {
  myProfileTitle: "個人設定",
  myProfileMenu: "個人設定",
  myProfileSaved: "保存しました",
  myProfileEmployeeNumber: "従業員番号",
  myProfileDepartment: "所属",
  myProfilePasswordSection: "パスワード変更",
  myProfileCurrentPassword: "現在のパスワード",
  myProfileNewPassword: "新しいパスワード",
  myProfileNewPasswordConfirm: "新しいパスワード（確認）",
  myProfilePasswordMismatch: "新しいパスワードが一致しません",
  myProfilePasswordChanged: "パスワードを変更しました",
  myProfilePasswordWrong: "現在のパスワードが間違っています",
  fixedTasksTitle: "固定タスク郡",
  fixedTasksDesc: "親タスク(例: 設備購入)に子タスク(仕様作成・ベンダー選定など)を登録しておくと、スプリントタスク登録時に一括追加できます",
  fixedTasksManage: "固定タスク管理",
  fixedTasksAdd: "追加",
  fixedTasksEmpty: "まだ固定タスク郡が登録されていません",
  fixedTasksNamePlaceholder: "親タスク名(例: 設備購入)",
  fixedTasksSelectPlaceholder: "-- 固定タスク郡から選択 --",
  fixedTasksApplyFromTemplate: "テンプレートから一括追加",
  fixedTasksGroupNamePlaceholder: "親タスク名(例: 設備購入)",
  fixedTasksItemNamePlaceholder: "子タスク名(例: 仕様作成)",
  fixedTasksItemEmpty: "子タスクがありません",
  fixedTasksBulkAdd: "全て追加",
  fixedTasksBulkAddPreview: "選択した郡から追加されるタスク",
  myProfileEmailChangeHint: "メールアドレスの変更は管理者に依頼してください",
  myProfileBasicInfo: "アカウント情報",
  fixedTasksGroupNameLabel: "親タスク名",
  fixedTasksItemNameLabel: "子タスク名",
  fixedTasksExpand: "子タスクを表示",
  fixedTasksCollapse: "子タスクを隠す",
  fixedTasksItemCount: "子タスク数",
  fixedTasksDeleteGroupConfirm: "親タスク「{name}」と配下の子タスクをすべて削除しますか？",
  fixedTasksDeleteItemConfirm: "子タスク「{name}」を削除しますか？",
  fixedTasksLoadFailed: "固定タスクの読み込みに失敗しました",
}

export const en: MeTranslations = {
  myProfileTitle: "My Profile",
  myProfileMenu: "My Profile",
  myProfileSaved: "Saved",
  myProfileEmployeeNumber: "Employee Number",
  myProfileDepartment: "Department",
  myProfilePasswordSection: "Change Password",
  myProfileCurrentPassword: "Current Password",
  myProfileNewPassword: "New Password",
  myProfileNewPasswordConfirm: "New Password (confirm)",
  myProfilePasswordMismatch: "New passwords do not match",
  myProfilePasswordChanged: "Password changed",
  myProfilePasswordWrong: "Current password is incorrect",
  fixedTasksTitle: "Fixed Task Groups",
  fixedTasksDesc: "Register a parent group (e.g. Equipment Purchase) with child sub-tasks (Spec / Vendor pick / RFQ / PO) — bulk-insert them into a sprint with one click",
  fixedTasksManage: "Manage Fixed Tasks",
  fixedTasksAdd: "Add",
  fixedTasksEmpty: "No fixed task groups yet",
  fixedTasksNamePlaceholder: "Parent group name (e.g. Equipment Purchase)",
  fixedTasksSelectPlaceholder: "-- Pick a fixed task group --",
  fixedTasksApplyFromTemplate: "Bulk-insert from template",
  fixedTasksGroupNamePlaceholder: "Parent group name (e.g. Equipment Purchase)",
  fixedTasksItemNamePlaceholder: "Child sub-task name (e.g. Write spec)",
  fixedTasksItemEmpty: "No child sub-tasks",
  fixedTasksBulkAdd: "Add all",
  fixedTasksBulkAddPreview: "Tasks to be added from the selected group",
  myProfileEmailChangeHint: "Ask an administrator to change your email address",
  myProfileBasicInfo: "Account information",
  fixedTasksGroupNameLabel: "Parent group name",
  fixedTasksItemNameLabel: "Child sub-task name",
  fixedTasksExpand: "Show sub-tasks",
  fixedTasksCollapse: "Hide sub-tasks",
  fixedTasksItemCount: "Number of sub-tasks",
  fixedTasksDeleteGroupConfirm: "Delete the group \"{name}\" and all of its sub-tasks?",
  fixedTasksDeleteItemConfirm: "Delete the sub-task \"{name}\"?",
  fixedTasksLoadFailed: "Failed to load fixed tasks",
}

export const id: MeTranslations = {
  myProfileTitle: "Profil Saya",
  myProfileMenu: "Profil Saya",
  myProfileSaved: "Tersimpan",
  myProfileEmployeeNumber: "Nomor Karyawan",
  myProfileDepartment: "Departemen",
  myProfilePasswordSection: "Ubah Kata Sandi",
  myProfileCurrentPassword: "Kata Sandi Saat Ini",
  myProfileNewPassword: "Kata Sandi Baru",
  myProfileNewPasswordConfirm: "Kata Sandi Baru (konfirmasi)",
  myProfilePasswordMismatch: "Kata sandi baru tidak cocok",
  myProfilePasswordChanged: "Kata sandi berhasil diubah",
  myProfilePasswordWrong: "Kata sandi saat ini salah",
  fixedTasksTitle: "Grup Tugas Tetap",
  fixedTasksDesc: "Daftarkan grup induk (mis. Pembelian Peralatan) dengan sub-tugas anak (Spesifikasi / Pemilihan Vendor / RFQ / PO) untuk dimasukkan ke sprint sekaligus",
  fixedTasksManage: "Kelola Tugas Tetap",
  fixedTasksAdd: "Tambah",
  fixedTasksEmpty: "Belum ada grup tugas tetap",
  fixedTasksNamePlaceholder: "Nama grup induk (mis. Pembelian Peralatan)",
  fixedTasksSelectPlaceholder: "-- Pilih grup tugas tetap --",
  fixedTasksApplyFromTemplate: "Sisipkan dari template",
  fixedTasksGroupNamePlaceholder: "Nama grup induk (mis. Pembelian Peralatan)",
  fixedTasksItemNamePlaceholder: "Nama sub-tugas anak (mis. Tulis spesifikasi)",
  fixedTasksItemEmpty: "Belum ada sub-tugas",
  fixedTasksBulkAdd: "Tambah semua",
  fixedTasksBulkAddPreview: "Tugas yang akan ditambahkan dari grup terpilih",
  myProfileEmailChangeHint: "Hubungi administrator untuk mengubah alamat email",
  myProfileBasicInfo: "Informasi akun",
  fixedTasksGroupNameLabel: "Nama grup induk",
  fixedTasksItemNameLabel: "Nama sub-tugas anak",
  fixedTasksExpand: "Tampilkan sub-tugas",
  fixedTasksCollapse: "Sembunyikan sub-tugas",
  fixedTasksItemCount: "Jumlah sub-tugas",
  fixedTasksDeleteGroupConfirm: "Hapus grup \"{name}\" beserta semua sub-tugasnya?",
  fixedTasksDeleteItemConfirm: "Hapus sub-tugas \"{name}\"?",
  fixedTasksLoadFailed: "Gagal memuat tugas tetap",
}
