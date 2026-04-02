"use client"

import { SessionProvider } from "next-auth/react"
import { ConfirmProvider } from "@/components/confirm-dialog"
import { LanguageProvider } from "@/lib/language-context"
import { type Language } from "@/lib/i18n"
import { type ReactNode } from "react"

export function Providers({
  children,
  userLanguage = "ja",
}: {
  children: ReactNode
  userLanguage?: Language
}) {
  return (
    <SessionProvider>
      <LanguageProvider initialLanguage={userLanguage} persistToUser>
        <ConfirmProvider>{children}</ConfirmProvider>
      </LanguageProvider>
    </SessionProvider>
  )
}
