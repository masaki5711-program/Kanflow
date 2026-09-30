import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { Header } from "@/components/header"
import { ApiTokenManagement } from "./api-token-management"
import { buildPageMetadata } from "@/app/page-metadata"

export function generateMetadata() {
  return buildPageMetadata(({ t }) => t.apiTokenAdminTitle)
}

/** Every user's active personal access tokens: list and revoke (admin only). */
export default async function AdminApiTokensPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")
  if (session.user.role !== "admin") redirect("/")

  return (
    <div className="min-h-screen bg-surface-muted">
      <Header />
      <main id="main-content" className="page-wide">
        <ApiTokenManagement />
      </main>
    </div>
  )
}
