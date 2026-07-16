import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { Header } from "@/components/header"
import { AdminCategoryManagement } from "./admin-category-management"

export default async function AdminCategoriesPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")
  if (session.user.role !== "admin") redirect("/")

  return (
    <div className="min-h-screen bg-gray-50/50">
      <Header />
      <main className="max-w-5xl mx-auto px-6 py-8">
        <AdminCategoryManagement />
      </main>
    </div>
  )
}
