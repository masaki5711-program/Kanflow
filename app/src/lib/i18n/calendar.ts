/**
 * i18n domain: Calendar and events.
 * Add a key to the interface AND to ja / en / id below (compile error otherwise).
 */
export interface CalendarTranslations {
  eventTitlePlaceholder: string
  eventDescriptionPlaceholder: string
  calendarTitle: string
  calendarShow: string
  calendarHide: string
  calendarWeekdays: string[]
  calendarNoEvents: string
  calendarWeekView: string
  calendarMonthView: string
  calendarTeamView: string
  eventAdd: string
  eventEdit: string
  eventTitle: string
  eventDescription: string
  eventStartDate: string
  eventEndDate: string
  eventColor: string
  eventSprintLink: string
  eventNone: string
  eventDeleteConfirm: string
  eventEvents: string
  calendarPrev: string
  calendarNext: string
  calendarToday: string
  calendarViewModeLabel: string
  calendarAddOnDate: string
  calendarMoreEvents: string
  calendarShowLess: string
  calendarTasksDue: string
  calendarNoTasks: string
  calendarDeadlineTitle: string
  calendarMembers: string
  calendarNoMembers: string
  calendarLoadFailed: string
  calendarEventSaved: string
  calendarEventDeleted: string
  calendarSaveFailed: string
  calendarDeleteFailed: string
  calendarTitleRequired: string
  calendarEndBeforeStart: string
  calendarDragHint: string
  calendarSprintProgress: string
  calendarColorNames: { blue: string; green: string; red: string; yellow: string; purple: string; gray: string }
}

export const ja: CalendarTranslations = {
  eventTitlePlaceholder: "例: スプリントレビュー、デモ",
  eventDescriptionPlaceholder: "イベントの詳細を入力（任意）",
  calendarTitle: "カレンダー",
  calendarShow: "カレンダーを表示",
  calendarHide: "カレンダーを隠す",
  calendarWeekdays: ["日", "月", "火", "水", "木", "金", "土"],
  calendarNoEvents: "イベントはありません",
  calendarWeekView: "週表示",
  calendarMonthView: "月表示",
  calendarTeamView: "チーム",
  eventAdd: "イベント追加",
  eventEdit: "イベント編集",
  eventTitle: "タイトル",
  eventDescription: "説明（任意）",
  eventStartDate: "開始日",
  eventEndDate: "終了日（任意）",
  eventColor: "色",
  eventSprintLink: "スプリント紐付（任意）",
  eventNone: "なし",
  eventDeleteConfirm: "このイベントを削除しますか？",
  eventEvents: "イベント",
  calendarPrev: "前へ",
  calendarNext: "次へ",
  calendarToday: "今日",
  calendarViewModeLabel: "表示切替",
  calendarAddOnDate: "{date} にイベントを追加",
  calendarMoreEvents: "他 {count} 件",
  calendarShowLess: "折りたたむ",
  calendarTasksDue: "期限のタスク {count} 件",
  calendarNoTasks: "タスクはありません",
  calendarDeadlineTitle: "{sprint} の期限（{date}）",
  calendarMembers: "メンバー",
  calendarNoMembers: "このプロジェクトにはメンバーがいません",
  calendarLoadFailed: "カレンダーの読み込みに失敗しました",
  calendarEventSaved: "イベントを保存しました",
  calendarEventDeleted: "イベントを削除しました",
  calendarSaveFailed: "イベントの保存に失敗しました",
  calendarDeleteFailed: "イベントの削除に失敗しました",
  calendarTitleRequired: "タイトルを入力してください",
  calendarEndBeforeStart: "終了日は開始日以降にしてください",
  calendarDragHint: "日付をドラッグして期間イベントを作成できます。キーボードでは日付の数字を選んで追加し、ダイアログで日付を変更できます。",
  calendarSprintProgress: "{sprint}（進捗 {progress}%）",
  calendarColorNames: { blue: "青", green: "緑", red: "赤", yellow: "黄", purple: "紫", gray: "グレー" },
}

export const en: CalendarTranslations = {
  eventTitlePlaceholder: "e.g., Sprint Review, Demo",
  eventDescriptionPlaceholder: "Optional event details",
  calendarTitle: "Calendar",
  calendarShow: "Show Calendar",
  calendarHide: "Hide Calendar",
  calendarWeekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  calendarNoEvents: "No events",
  calendarWeekView: "Week",
  calendarMonthView: "Month",
  calendarTeamView: "Team",
  eventAdd: "Add Event",
  eventEdit: "Edit Event",
  eventTitle: "Title",
  eventDescription: "Description (optional)",
  eventStartDate: "Start Date",
  eventEndDate: "End Date (optional)",
  eventColor: "Color",
  eventSprintLink: "Link to Sprint (optional)",
  eventNone: "None",
  eventDeleteConfirm: "Delete this event?",
  eventEvents: "Events",
  calendarPrev: "Previous",
  calendarNext: "Next",
  calendarToday: "Today",
  calendarViewModeLabel: "View",
  calendarAddOnDate: "Add event on {date}",
  calendarMoreEvents: "+{count} more",
  calendarShowLess: "Show less",
  calendarTasksDue: "{count} tasks due",
  calendarNoTasks: "No tasks",
  calendarDeadlineTitle: "{sprint} due ({date})",
  calendarMembers: "Members",
  calendarNoMembers: "This project has no members",
  calendarLoadFailed: "Failed to load the calendar",
  calendarEventSaved: "Event saved",
  calendarEventDeleted: "Event deleted",
  calendarSaveFailed: "Failed to save the event",
  calendarDeleteFailed: "Failed to delete the event",
  calendarTitleRequired: "Please enter a title",
  calendarEndBeforeStart: "End date must be on or after the start date",
  calendarDragHint: "Drag across days to create a multi-day event. With a keyboard, choose a day number to add an event and change the dates in the dialog.",
  calendarSprintProgress: "{sprint} ({progress}% done)",
  calendarColorNames: { blue: "Blue", green: "Green", red: "Red", yellow: "Yellow", purple: "Purple", gray: "Gray" },
}

export const id: CalendarTranslations = {
  eventTitlePlaceholder: "misalnya: Sprint Review, Demo",
  eventDescriptionPlaceholder: "Detail acara (opsional)",
  calendarTitle: "Kalender",
  calendarShow: "Tampilkan Kalender",
  calendarHide: "Sembunyikan Kalender",
  calendarWeekdays: ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"],
  calendarNoEvents: "Tidak ada acara",
  calendarWeekView: "Minggu",
  calendarMonthView: "Bulan",
  calendarTeamView: "Tim",
  eventAdd: "Tambah Acara",
  eventEdit: "Edit Acara",
  eventTitle: "Judul",
  eventDescription: "Deskripsi (opsional)",
  eventStartDate: "Tanggal Mulai",
  eventEndDate: "Tanggal Selesai (opsional)",
  eventColor: "Warna",
  eventSprintLink: "Hubungkan ke Sprint (opsional)",
  eventNone: "Tidak ada",
  eventDeleteConfirm: "Hapus acara ini?",
  eventEvents: "Acara",
  calendarPrev: "Sebelumnya",
  calendarNext: "Berikutnya",
  calendarToday: "Hari Ini",
  calendarViewModeLabel: "Tampilan",
  calendarAddOnDate: "Tambah acara pada {date}",
  calendarMoreEvents: "+{count} lainnya",
  calendarShowLess: "Tampilkan lebih sedikit",
  calendarTasksDue: "{count} tugas jatuh tempo",
  calendarNoTasks: "Tidak ada tugas",
  calendarDeadlineTitle: "Tenggat {sprint} ({date})",
  calendarMembers: "Anggota",
  calendarNoMembers: "Proyek ini belum memiliki anggota",
  calendarLoadFailed: "Gagal memuat kalender",
  calendarEventSaved: "Acara disimpan",
  calendarEventDeleted: "Acara dihapus",
  calendarSaveFailed: "Gagal menyimpan acara",
  calendarDeleteFailed: "Gagal menghapus acara",
  calendarTitleRequired: "Masukkan judul",
  calendarEndBeforeStart: "Tanggal selesai harus sama dengan atau setelah tanggal mulai",
  calendarDragHint: "Seret melintasi beberapa hari untuk membuat acara multi-hari. Dengan keyboard, pilih angka tanggal untuk menambah acara lalu ubah tanggal di dialog.",
  calendarSprintProgress: "{sprint} (selesai {progress}%)",
  calendarColorNames: { blue: "Biru", green: "Hijau", red: "Merah", yellow: "Kuning", purple: "Ungu", gray: "Abu-abu" },
}
