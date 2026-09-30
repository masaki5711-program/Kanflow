import type { Metadata } from "next"
import { cookies, headers } from "next/headers"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { type Language } from "@/lib/i18n"
import { Providers } from "@/components/providers"
import { SkipLink } from "@/components/app-shell/skip-link"
import { RememberLanguage } from "@/components/app-shell/remember-language"
import { LAST_LANGUAGE_COOKIE, isLanguage, resolveAnonymousLanguage } from "@/lib/last-language"
import "./globals.css"

export const metadata: Metadata = {
  title: "Kanflow",
  description: "Agile Project Management Tool",
  icons: {
    icon: "/favicon.svg",
  },
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const session = await auth()
  const signedIn = Boolean(session?.user?.id)
  // Signed out (login page): the last language used in this browser, else the
  // browser's Accept-Language — never a hard-coded default that the login page
  // would then save over the user's preference.
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()])
  let userLanguage: Language = resolveAnonymousLanguage(
    cookieStore.get(LAST_LANGUAGE_COOKIE)?.value,
    headerList.get("accept-language"),
  )

  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { language: true },
    })
    const saved = user?.language
    if (isLanguage(saved)) userLanguage = saved
  }

  return (
    <html lang={userLanguage}>
      <body className="font-sans antialiased bg-surface-muted text-fg">
        <Providers userLanguage={userLanguage} session={session}>
          <SkipLink />
          {signedIn && <RememberLanguage language={userLanguage} />}
          {children}
        </Providers>
      </body>
    </html>
  )
}
