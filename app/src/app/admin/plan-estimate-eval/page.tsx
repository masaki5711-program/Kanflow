import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { Header } from "@/components/header"
import { canManageEstimateGate } from "@/lib/authz/policy"
import { AdminBackLink } from "../admin-back-link"
import { AdminEstimateEval } from "./admin-estimate-eval"
import { buildPageMetadata } from "@/app/page-metadata"

export function generateMetadata() {
  return buildPageMetadata(({ t }) => t.peeAdminTitle)
}

/** The backtest of real actuals and the per-lineage approval (admins only: `canManageEstimateGate`). */
export default async function AdminPlanEstimateEvalPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")
  if (!canManageEstimateGate({ systemRole: session.user.role ?? "member" })) redirect("/")

  return (
    <div className="min-h-screen bg-surface-muted">
      <Header />
      <main id="main-content" className="page-wide">
        <AdminBackLink />
        <AdminEstimateEval />
      </main>
    </div>
  )
}
