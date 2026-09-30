"use client"

import { SessionProvider } from "next-auth/react"
import { ConfirmProvider, ToastProvider } from "@/components/ui"
import { LanguageProvider } from "@/lib/language-context"
import { type Language } from "@/lib/i18n"
import { type ReactNode } from "react"
import IdleLogoutWatcher from "@/components/idle-logout-watcher"
import { LiveAnnouncer } from "@/components/live-announcer"

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
      {/* Single shared polite live region (see live-announcer.tsx). */}
      <LiveAnnouncer />
      <LanguageProvider initialLanguage={userLanguage} persistToUser>
        {/* Toast/Confirm sit inside LanguageProvider so their default labels are localized. */}
        <ToastProvider>
          <ConfirmProvider>{children}</ConfirmProvider>
        </ToastProvider>
      </LanguageProvider>
    </SessionProvider>
  )
}
