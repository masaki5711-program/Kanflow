import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { Header } from "@/components/header"
import { CategorySettings } from "./category-settings"
import { buildPageMetadata } from "@/app/page-metadata"

export function generateMetadata() {
  return buildPageMetadata(({ t }) => t.categorySettingsTitle)
}

export default async function CategoriesPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  return (
    <div className="min-h-screen bg-gray-50/50">
      <Header />
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <CategorySettings />
      </main>
    </div>
  )
}
