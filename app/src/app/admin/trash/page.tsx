import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { Header } from "@/components/header"
import { ProjectTrashManagement } from "./project-trash-management"
import { buildPageMetadata } from "@/app/page-metadata"

export function generateMetadata() {
  return buildPageMetadata(({ t }) => t.trashAdminTitle)
}

/** Trashed projects: restore or delete permanently (admin only). */
export default async function AdminTrashPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")
  if (session.user.role !== "admin") redirect("/")

  return (
    <div className="min-h-screen bg-surface-muted">
      <Header />
      <main id="main-content" className="page-narrow">
        <ProjectTrashManagement />
      </main>
    </div>
  )
}
