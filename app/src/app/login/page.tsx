"use client"

import { signIn } from "next-auth/react"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { type Language, getTranslations, languageLabels } from "@/lib/i18n"

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [language, setLanguage] = useState<Language>("ja")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const t = getTranslations(language)

  // Surface a friendly reason when the user was bounced here by the
  // idle-logout watcher (?reason=idle). Falls back silently if not set.
  useEffect(() => {
    if (searchParams.get("reason") === "idle") {
      setError(t.sessionTimedOut)
    }
    // Re-evaluate on language change so the message follows the language toggle.
  }, [searchParams, t.sessionTimedOut])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      })

      if (result?.error) {
        setError(t.loginError)
        setLoading(false)
        return
      }

      // Save the selected language as the user's default.
      await fetch("/api/user/language", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language }),
      }).catch(() => {})

      router.push("/")
      router.refresh()
    } catch {
      setError(t.error)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Animated gradient background */}
      <div
        className="absolute inset-0 -z-10"
        style={{
          background: "linear-gradient(-45deg, #f0f9ff, #e0f2fe, #ede9fe, #f0f9ff)",
          backgroundSize: "400% 400%",
          animation: "gradientShift 15s ease infinite",
        }}
      />

      {/* Decorative blurred circles */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-blue-200/30 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-indigo-200/30 rounded-full blur-3xl" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-sky-100/20 rounded-full blur-3xl" />

      <style jsx>{`
        @keyframes gradientShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>

      {/* Language selector — floating top-right */}
      <div className="absolute top-6 right-6 z-10">
        <div className="flex items-center gap-1 px-1.5 py-1.5 bg-white/70 backdrop-blur-xl rounded-full border border-white/60 shadow-sm shadow-gray-900/5">
          <svg className="w-4 h-4 text-gray-400 ml-1.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.5-1.526A6.5 6.5 0 0010 3.526V16.474zM3.526 9.5h2.99c.09-1.926.61-3.668 1.443-4.967A6.51 6.51 0 003.526 9.5zM7.957 5.61C7.193 6.78 6.692 8.323 6.6 10h2.9V5.526a6.49 6.49 0 00-1.543.083zm5.487 9.357c.832-1.299 1.353-3.04 1.443-4.967h2.99a6.51 6.51 0 01-4.433 4.967zM10.5 11.474V16a6.5 6.5 0 01-1.543-.083C8.193 14.78 7.692 13.237 7.6 11.5h2.9zm0-1.474h2.9c-.092-1.677-.593-3.22-1.357-4.39a6.49 6.49 0 00-1.543-.083V10zm-7-.5a6.5 6.5 0 016.5-6.5V10H3.5z" clipRule="evenodd"/>
          </svg>
          {(Object.keys(languageLabels) as Language[]).map((lang) => (
            <button
              key={lang}
              type="button"
              onClick={() => setLanguage(lang)}
              aria-label={languageLabels[lang]}
              aria-pressed={language === lang}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide transition-all ${
                language === lang
                  ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm shadow-blue-500/30"
                  : "text-gray-500 hover:text-gray-800 hover:bg-white/80"
              }`}
            >
              {lang.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="w-full max-w-md relative">
        <div className="text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="Kanflow" width={64} height={64} className="mx-auto mb-4 shadow-lg shadow-blue-500/20 rounded-2xl" />
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Kanflow</h1>
          <p className="text-sm text-gray-500 mt-1.5">{t.loginSubtitle}</p>
        </div>

        <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-xl shadow-gray-900/5 border border-white/60 p-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">{t.loginTitle}</h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {t.loginEmail}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white/60 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder:text-gray-300 transition-all duration-200"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {t.loginPassword}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                placeholder={t.loginPasswordPlaceholder}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white/60 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder:text-gray-300 transition-all duration-200"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
                </svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-medium text-sm hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 shadow-md shadow-blue-500/20 hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-200 active:scale-[0.98]"
            >
              {loading ? t.loginProcessing : t.loginButton}
            </button>
          </form>

          <p className="mt-6 pt-6 border-t border-gray-100 text-center text-xs text-gray-400">
            {t.loginAccountNote}
          </p>
        </div>
      </div>
    </div>
  )
}
