import type { Metadata } from "next"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { type Language } from "@/lib/i18n"
import { Providers } from "@/components/providers"
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
  let userLanguage: Language = "ja"

  const session = await auth()
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { language: true },
    })
    if (user?.language) {
      userLanguage = user.language as Language
    }
  }

  return (
    <html lang={userLanguage}>
      <body className="font-sans antialiased bg-gray-50">
        <Providers userLanguage={userLanguage}>{children}</Providers>
      </body>
    </html>
  )
}
