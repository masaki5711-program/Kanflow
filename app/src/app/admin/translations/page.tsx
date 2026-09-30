import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { Header } from "@/components/header"
import { TranslationQueuePanel } from "./translation-queue-panel"
import { buildPageMetadata } from "@/app/page-metadata"

export function generateMetadata() {
  return buildPageMetadata(({ t }) => t.translationsTitle)
}

/** Background translation queue status (admin only). */
export default async function AdminTranslationsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")
  if (session.user.role !== "admin") redirect("/")

  return (
    <div className="min-h-screen bg-gray-50/50">
      <Header />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <TranslationQueuePanel />
      </main>
    </div>
  )
}
