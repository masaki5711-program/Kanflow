"use client"

import { SessionProvider } from "next-auth/react"
import { ConfirmProvider } from "@/components/confirm-dialog"
import { type ReactNode } from "react"

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ConfirmProvider>{children}</ConfirmProvider>
    </SessionProvider>
  )
}
