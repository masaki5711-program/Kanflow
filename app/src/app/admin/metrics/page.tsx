import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { Header } from "@/components/header"
import { AdminBackLink } from "../admin-back-link"
import { MetricsDashboard } from "./metrics-dashboard"
import { buildPageMetadata } from "@/app/page-metadata"

export function generateMetadata() {
  return buildPageMetadata(({ t }) => t.metricsTitle)
}

/** Request / AI / queue / worker / DB metrics (admin only). */
export default async function AdminMetricsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")
  if (session.user.role !== "admin") redirect("/")

  return (
    <div className="min-h-screen bg-surface-muted">
      <Header />
      <main id="main-content" className="page-wide">
        <AdminBackLink />
        <MetricsDashboard />
      </main>
    </div>
  )
}
