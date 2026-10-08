"use client"

import { SessionProvider } from "next-auth/react"
import type { Session } from "next-auth"
import { ConfirmProvider, ToastProvider } from "@/components/ui"
import { LanguageProvider } from "@/lib/language-context"
import { type Language } from "@/lib/i18n"
import { type ReactNode } from "react"
import IdleLogoutWatcher from "@/components/idle-logout-watcher"
import { LiveAnnouncer } from "@/components/live-announcer"
import { DesktopNotifier } from "@/components/notifications/desktop-notifier"
import { RealtimeProvider } from "@/components/realtime/realtime-provider"

export function Providers({
  children,
  userLanguage = "ja",
  session,
}: {
  children: ReactNode
  userLanguage?: Language
  /**
   * The server's session (root layout). Seeding the provider makes the first
   * client render equal to the server HTML: without it the session arrived by
   * fetch after hydration and changed session-dependent markup (header nav,
   * page permissions) under page boundaries that were still hydrating — the
   * intermittent React #418 of C3-01. null = signed out.
   */
  session?: Session | null
}) {
  return (
    <SessionProvider session={session}>
      <IdleLogoutWatcher />
      {/* Single shared polite live region (see live-announcer.tsx). */}
      <LiveAnnouncer />
      {/* One real-time event stream per tab (live refresh of chats, comments, boards, badges). */}
      <RealtimeProvider>
        <LanguageProvider initialLanguage={userLanguage} persistToUser>
          {/* Toast/Confirm sit inside LanguageProvider so their default labels are localized. */}
          <ToastProvider>
            <ConfirmProvider>
              {/* Desktop popups for new notifications / chat while the tab is in the background. */}
              <DesktopNotifier />
              {children}
            </ConfirmProvider>
          </ToastProvider>
        </LanguageProvider>
      </RealtimeProvider>
    </SessionProvider>
  )
}
