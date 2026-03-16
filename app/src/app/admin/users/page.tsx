import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { Header } from "@/components/header"
import { UserManagement } from "./user-management"

export default async function AdminUsersPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")
  if (session.user.role !== "admin") redirect("/")

  return (
    <div className="min-h-screen bg-gray-50/50">
      <Header />
      <main className="max-w-4xl mx-auto px-6 py-8">
        <UserManagement />
      </main>
    </div>
  )
}
