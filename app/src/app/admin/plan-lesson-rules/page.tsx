import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { Header } from "@/components/header"
import { canConfirmLineageRule } from "@/lib/authz/policy"
import { AdminBackLink } from "../admin-back-link"
import { AdminLessonRules } from "./admin-lesson-rules"
import { buildPageMetadata } from "@/app/page-metadata"

export function generateMetadata() {
  return buildPageMetadata(({ t }) => t.plrAdminTitle)
}

/** Shared lesson rules and promotion requests (admins only: `canConfirmLineageRule`). */
export default async function AdminPlanLessonRulesPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")
  if (!canConfirmLineageRule({ systemRole: session.user.role ?? "member" })) redirect("/")

  return (
    <div className="min-h-screen bg-surface-muted">
      <Header />
      <main id="main-content" className="page-wide">
        <AdminBackLink />
        <AdminLessonRules />
      </main>
    </div>
  )
}
