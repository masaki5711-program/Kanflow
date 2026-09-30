/**
 * i18n domain: Login page.
 * Add a key to the interface AND to ja / en / id below (compile error otherwise).
 */
export interface AuthTranslations {
  // Login
  loginTitle: string
  loginSubtitle: string
  loginEmail: string
  loginPassword: string
  loginPasswordPlaceholder: string
  loginButton: string
  loginProcessing: string
  loginError: string
  loginAccountNote: string
}

export const ja: AuthTranslations = {
  loginTitle: "ログイン",
  loginSubtitle: "チームのプロジェクト管理",
  loginEmail: "メールアドレス",
  loginPassword: "パスワード",
  loginPasswordPlaceholder: "6文字以上",
  loginButton: "ログイン",
  loginProcessing: "処理中...",
  loginError: "メールアドレスまたはパスワードが正しくありません",
  loginAccountNote: "アカウントは管理者が作成します",
}

export const en: AuthTranslations = {
  loginTitle: "Login",
  loginSubtitle: "Team Project Management",
  loginEmail: "Email Address",
  loginPassword: "Password",
  loginPasswordPlaceholder: "6 characters or more",
  loginButton: "Login",
  loginProcessing: "Processing...",
  loginError: "Invalid email or password",
  loginAccountNote: "Accounts are created by administrators",
}

export const id: AuthTranslations = {
  loginTitle: "Masuk",
  loginSubtitle: "Manajemen Proyek Tim",
  loginEmail: "Alamat Email",
  loginPassword: "Kata Sandi",
  loginPasswordPlaceholder: "6 karakter atau lebih",
  loginButton: "Masuk",
  loginProcessing: "Memproses...",
  loginError: "Email atau kata sandi salah",
  loginAccountNote: "Akun dibuat oleh administrator",
}
