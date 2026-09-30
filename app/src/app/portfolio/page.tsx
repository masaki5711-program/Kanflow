import { Suspense } from "react"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { Header } from "@/components/header"
import { buildPageMetadata } from "@/app/page-metadata"
import { getPortfolio } from "@/services/portfolio/portfolio.service"
import { canViewPortfolio } from "@/services/portfolio/portfolio.scope"
import { PortfolioView } from "./portfolio-view"

export function generateMetadata() {
  return buildPageMetadata(({ t }) => t.portfolioTitle)
}

/** Department portfolio: system admins (all projects) and section managers (their sections' projects). */
export default async function PortfolioPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")
  const viewer = { userId: session.user.id, systemRole: session.user.role ?? "member" }
  if (!canViewPortfolio(viewer)) redirect("/")

  const data = await getPortfolio(viewer)
  return (
    <div className="min-h-screen bg-surface-muted">
      <Header />
      <main id="main-content" className="page-wide">
        {/* useSearchParams (filters / sort in the URL) needs a Suspense boundary. */}
        <Suspense>
          <PortfolioView data={data} />
        </Suspense>
      </main>
    </div>
  )
}
