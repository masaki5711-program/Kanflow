"use client"

import { signIn } from "next-auth/react"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useId, useState } from "react"
import { AlertCircle, Globe } from "lucide-react"
import { type Language, getTranslations, languageLabels } from "@/lib/i18n"
import { useLanguage } from "@/lib/language-context"
import { Button, Field, Input, cn } from "@/components/ui"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { apiFetch } from "@/hooks/api-client"

const LOGIN_LANGUAGES = Object.keys(languageLabels) as Language[]

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [language, setLanguage] = useState<Language>("ja")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  // Store the error *kind* rather than its text so the message follows the
  // language toggle.
  const [errorKind, setErrorKind] = useState<"login" | "generic" | null>(null)
  const [loading, setLoading] = useState(false)
  // Once the user submits, the idle notice from the URL is no longer relevant.
  const [idleNoticeDismissed, setIdleNoticeDismissed] = useState(false)
  const errorId = useId()
  const { setLanguageLocal } = useLanguage()

  const t = getTranslations(language)
  useDocumentTitle([t.loginTitle])

  // <html lang> follows the language chosen here (WCAG 3.1.1).
  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  function changeLanguage(lang: Language) {
    setLanguage(lang)
    // keep the shared context (kit labels, toasts) in the same language
    setLanguageLocal(lang)
  }

  // Friendly reason when bounced here by the idle-logout watcher
  // (?reason=idle) — derived during render, no effect/state sync needed.
  const showIdleNotice = !idleNoticeDismissed && searchParams.get("reason") === "idle"
  const error =
    errorKind === "login" ? t.loginError
    : errorKind === "generic" ? t.error
    : showIdleNotice ? t.sessionTimedOut
    : ""

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorKind(null)
    setIdleNoticeDismissed(true)
    setLoading(true)

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      })

      if (result?.error) {
        setErrorKind("login")
        setLoading(false)
        return
      }

      // Save the selected language as the user's default. Best-effort: login
      // already succeeded, so a failure here must not block navigation.
      await apiFetch("/api/user/language", { method: "PATCH", json: { language } }).catch((err: unknown) => console.warn("[login] could not save default language", err))

      router.push("/")
      router.refresh()
    } catch {
      setErrorKind("generic")
      setLoading(false)
    }
  }

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10"
    >
      {/* Decorative background (static under reduced motion via the global rule) */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10"
        style={{
          background: "linear-gradient(-45deg, #f0f9ff, #e0f2fe, #ede9fe, #f0f9ff)",
          backgroundSize: "400% 400%",
          animation: "login-gradient-shift 15s ease infinite",
        }}
      />
      <div aria-hidden="true" className="absolute top-1/4 -left-32 h-96 w-96 rounded-full bg-blue-200/30 blur-3xl" />
      <div aria-hidden="true" className="absolute bottom-1/4 -right-32 h-96 w-96 rounded-full bg-indigo-200/30 blur-3xl" />

      {/* Language selector — floating top-right */}
      <div className="absolute right-4 top-4 z-10 sm:right-6 sm:top-6">
        <div
          role="group"
          aria-label={t.topLanguageLabel}
          className="flex items-center gap-1 rounded-full border border-border bg-surface/80 p-1 shadow-ui-sm backdrop-blur-xl"
        >
          <Globe aria-hidden="true" className="ml-1.5 h-4 w-4 text-fg-subtle" />
          {LOGIN_LANGUAGES.map((lang) => (
            <button
              key={lang}
              type="button"
              onClick={() => changeLanguage(lang)}
              aria-pressed={language === lang}
              lang={lang}
              title={languageLabels[lang]}
              className={cn(
                "min-h-8 min-w-10 rounded-full px-2.5 text-caption font-semibold tracking-wide",
                language === lang
                  ? "bg-primary text-primary-fg shadow-ui-sm"
                  : "text-fg-muted hover:bg-surface-sunken hover:text-fg",
              )}
            >
              {/* Accessible name starts with the visible "JA"/"EN"/"ID" (WCAG 2.5.3). */}
              {lang.toUpperCase()}
              <span className="sr-only"> — {languageLabels[lang]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" width={64} height={64} className="mx-auto mb-4 rounded-ui-lg shadow-ui-md" />
          <h1 className="text-3xl font-bold tracking-tight text-fg">Kanflow</h1>
          <p className="mt-1.5 text-body text-fg-muted">{t.loginSubtitle}</p>
        </div>

        <div className="rounded-ui-lg border border-border bg-surface/90 p-8 shadow-ui-lg backdrop-blur-xl">
          <h2 className="mb-6 text-title font-semibold text-fg">{t.loginTitle}</h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            <Field label={t.loginEmail}>
              <Input
                type="email"
                autoComplete="username"
                inputSize="lg"
                aria-invalid={errorKind === "login" || undefined}
                aria-describedby={error ? errorId : undefined}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
              />
            </Field>

            <Field label={t.loginPassword}>
              <Input
                type="password"
                autoComplete="current-password"
                inputSize="lg"
                aria-invalid={errorKind === "login" || undefined}
                aria-describedby={error ? errorId : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                placeholder={t.loginPasswordPlaceholder}
              />
            </Field>

            {error && (
              <div
                id={errorId}
                role="alert"
                className="flex items-center gap-2 rounded-ui-md bg-danger-soft px-4 py-3 text-body text-danger-strong"
              >
                <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <Button type="submit" size="lg" fullWidth loading={loading}>
              {loading ? t.loginProcessing : t.loginButton}
            </Button>
          </form>

          <p className="mt-6 border-t border-border pt-6 text-center text-caption text-fg-muted">
            {t.loginAccountNote}
          </p>
        </div>
      </div>
    </main>
  )
}
