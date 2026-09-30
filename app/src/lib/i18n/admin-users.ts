/**
 * i18n domain: Admin: user management.
 * Add a key to the interface AND to ja / en / id below (compile error otherwise).
 */
export interface AdminUsersTranslations {
  // User Management
  userManagementTitle: string
  userCount: string
  userAdd: string
  userCreateTitle: string
  userName: string
  userNamePlaceholder: string
  userEmail: string
  userInitialPassword: string
  userPasswordMinLength: string
  userRole: string
  userRoleMember: string
  userRoleAdmin: string
  userResetPassword: string
  userResetPasswordFor: string
  userNewPasswordPlaceholder: string
  userReset: string
  userInactive: string
  userProjects: string
  userDeactivate: string
  userActivate: string
  userPasswordMinError: string
  userEmployeeNumber: string
  userEmployeeNumberPlaceholder: string
  userDepartment: string
  userDepartmentPlaceholder: string
  userSearchPlaceholder: string
  userFilterRoleAll: string
  userFilterStatusAll: string
  userFilterActive: string
  userFilterInactive: string
  userNoResults: string
  userEditTitle: string
  userCreated: string
  userUpdated: string
  userPasswordResetDone: string
  userDeactivateConfirm: string
  userActivated: string
  userDeactivated: string
  userSearchLabel: string
  userFilterRoleLabel: string
  userFilterStatusLabel: string
  userFilterDepartmentLabel: string
  userListLabel: string
}

export const ja: AdminUsersTranslations = {
  userManagementTitle: "ユーザー管理",
  userCount: "名のユーザー",
  userAdd: "ユーザー追加",
  userCreateTitle: "新規ユーザー作成",
  userName: "名前",
  userNamePlaceholder: "山田 太郎",
  userEmail: "メールアドレス",
  userInitialPassword: "初期パスワード",
  userPasswordMinLength: "6文字以上",
  userRole: "権限",
  userRoleMember: "メンバー",
  userRoleAdmin: "管理者",
  userResetPassword: "パスワードリセット",
  userResetPasswordFor: "のパスワードをリセット",
  userNewPasswordPlaceholder: "新しいパスワード（6文字以上）",
  userReset: "リセット",
  userInactive: "無効",
  userProjects: "プロジェクト",
  userDeactivate: "無効化",
  userActivate: "有効化",
  userPasswordMinError: "パスワードは6文字以上で入力してください",
  userEmployeeNumber: "従業員番号",
  userEmployeeNumberPlaceholder: "EMP0001",
  userDepartment: "所属",
  userDepartmentPlaceholder: "例：戦略企画部",
  userSearchPlaceholder: "名前・メール・従業員番号・所属で検索",
  userFilterRoleAll: "すべての権限",
  userFilterStatusAll: "すべての状態",
  userFilterActive: "有効のみ",
  userFilterInactive: "無効のみ",
  userNoResults: "該当するユーザーがいません",
  userEditTitle: "ユーザー編集",
  userCreated: "ユーザーを作成しました",
  userUpdated: "ユーザー情報を更新しました",
  userPasswordResetDone: "パスワードをリセットしました",
  userDeactivateConfirm: "{name} を無効化しますか？このユーザーはログインできなくなります。",
  userActivated: "ユーザーを有効化しました",
  userDeactivated: "ユーザーを無効化しました",
  userSearchLabel: "ユーザー検索",
  userFilterRoleLabel: "権限で絞り込み",
  userFilterStatusLabel: "状態で絞り込み",
  userFilterDepartmentLabel: "所属で絞り込み",
  userListLabel: "ユーザー一覧",
}

export const en: AdminUsersTranslations = {
  userManagementTitle: "User Management",
  userCount: "users",
  userAdd: "Add User",
  userCreateTitle: "Create New User",
  userName: "Name",
  userNamePlaceholder: "John Doe",
  userEmail: "Email Address",
  userInitialPassword: "Initial Password",
  userPasswordMinLength: "6+ characters",
  userRole: "Role",
  userRoleMember: "Member",
  userRoleAdmin: "Admin",
  userResetPassword: "Reset Password",
  userResetPasswordFor: "'s password reset",
  userNewPasswordPlaceholder: "New password (6+ characters)",
  userReset: "Reset",
  userInactive: "Inactive",
  userProjects: "projects",
  userDeactivate: "Deactivate",
  userActivate: "Activate",
  userPasswordMinError: "Password must be at least 6 characters",
  userEmployeeNumber: "Employee ID",
  userEmployeeNumberPlaceholder: "EMP0001",
  userDepartment: "Department",
  userDepartmentPlaceholder: "e.g. Strategic Planning",
  userSearchPlaceholder: "Search by name, email, employee ID, or department",
  userFilterRoleAll: "All roles",
  userFilterStatusAll: "All statuses",
  userFilterActive: "Active only",
  userFilterInactive: "Inactive only",
  userNoResults: "No users match your search",
  userEditTitle: "Edit User",
  userCreated: "User created",
  userUpdated: "User updated",
  userPasswordResetDone: "Password has been reset",
  userDeactivateConfirm: "Deactivate {name}? This user will no longer be able to sign in.",
  userActivated: "User activated",
  userDeactivated: "User deactivated",
  userSearchLabel: "Search users",
  userFilterRoleLabel: "Filter by role",
  userFilterStatusLabel: "Filter by status",
  userFilterDepartmentLabel: "Filter by department",
  userListLabel: "User list",
}

export const id: AdminUsersTranslations = {
  userManagementTitle: "Manajemen Pengguna",
  userCount: "pengguna",
  userAdd: "Tambah Pengguna",
  userCreateTitle: "Buat Pengguna Baru",
  userName: "Nama",
  userNamePlaceholder: "Budi Santoso",
  userEmail: "Alamat Email",
  userInitialPassword: "Kata Sandi Awal",
  userPasswordMinLength: "6+ karakter",
  userRole: "Peran",
  userRoleMember: "Anggota",
  userRoleAdmin: "Admin",
  userResetPassword: "Reset Kata Sandi",
  userResetPasswordFor: " reset kata sandi",
  userNewPasswordPlaceholder: "Kata sandi baru (6+ karakter)",
  userReset: "Reset",
  userInactive: "Nonaktif",
  userProjects: "proyek",
  userDeactivate: "Nonaktifkan",
  userActivate: "Aktifkan",
  userPasswordMinError: "Kata sandi minimal 6 karakter",
  userEmployeeNumber: "Nomor Karyawan",
  userEmployeeNumberPlaceholder: "EMP0001",
  userDepartment: "Departemen",
  userDepartmentPlaceholder: "mis. Perencanaan Strategis",
  userSearchPlaceholder: "Cari berdasarkan nama, email, nomor karyawan, atau departemen",
  userFilterRoleAll: "Semua peran",
  userFilterStatusAll: "Semua status",
  userFilterActive: "Aktif saja",
  userFilterInactive: "Nonaktif saja",
  userNoResults: "Tidak ada pengguna yang cocok",
  userEditTitle: "Sunting Pengguna",
  userCreated: "Pengguna berhasil dibuat",
  userUpdated: "Data pengguna diperbarui",
  userPasswordResetDone: "Kata sandi berhasil direset",
  userDeactivateConfirm: "Nonaktifkan {name}? Pengguna ini tidak akan bisa masuk lagi.",
  userActivated: "Pengguna diaktifkan",
  userDeactivated: "Pengguna dinonaktifkan",
  userSearchLabel: "Cari pengguna",
  userFilterRoleLabel: "Saring berdasarkan peran",
  userFilterStatusLabel: "Saring berdasarkan status",
  userFilterDepartmentLabel: "Saring berdasarkan departemen",
  userListLabel: "Daftar pengguna",
}
