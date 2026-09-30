import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { Header } from "@/components/header"
import { GlossaryManagement } from "./glossary-management"
import { buildPageMetadata } from "@/app/page-metadata"

export function generateMetadata() {
  return buildPageMetadata(({ t }) => t.glossaryTitle)
}

/** Shared translation glossary (admin only). */
export default async function AdminGlossaryPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")
  if (session.user.role !== "admin") redirect("/")

  return (
    <div className="min-h-screen bg-gray-50/50">
      <Header />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <GlossaryManagement />
      </main>
    </div>
  )
}
