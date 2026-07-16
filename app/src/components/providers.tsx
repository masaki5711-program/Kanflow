"use client"

import { SessionProvider } from "next-auth/react"
import { ConfirmProvider } from "@/components/confirm-dialog"
import { LanguageProvider } from "@/lib/language-context"
import { type Language } from "@/lib/i18n"
import { type ReactNode } from "react"
import IdleLogoutWatcher from "@/components/idle-logout-watcher"

export function Providers({
  children,
  userLanguage = "ja",
}: {
  children: ReactNode
  userLanguage?: Language
}) {
  return (
    <SessionProvider>
      <IdleLogoutWatcher />
      <LanguageProvider initialLanguage={userLanguage} persistToUser>
        <ConfirmProvider>{children}</ConfirmProvider>
      </LanguageProvider>
    </SessionProvider>
  )
}
