import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { Header } from "@/components/header"
import { UserManagement } from "./user-management"
import { buildPageMetadata } from "@/app/page-metadata"

export function generateMetadata() {
  return buildPageMetadata(({ t }) => t.userManagementTitle)
}

export default async function AdminUsersPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")
  if (session.user.role !== "admin") redirect("/")

  return (
    <div className="min-h-screen bg-gray-50/50">
      <Header />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <UserManagement />
      </main>
    </div>
  )
}
