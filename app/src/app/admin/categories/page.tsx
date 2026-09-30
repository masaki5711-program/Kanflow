import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { Header } from "@/components/header"
import { AdminCategoryManagement } from "./admin-category-management"
import { buildPageMetadata } from "@/app/page-metadata"

export function generateMetadata() {
  return buildPageMetadata(({ t }) => t.categoryAdminTitle)
}

export default async function AdminCategoriesPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")
  if (session.user.role !== "admin") redirect("/")

  return (
    <div className="min-h-screen bg-surface-muted">
      <Header />
      <main id="main-content" className="page-narrow">
        <AdminCategoryManagement />
      </main>
    </div>
  )
}
