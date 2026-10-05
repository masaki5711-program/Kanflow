import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { Header } from "@/components/header"
import { buildPageMetadata } from "@/app/page-metadata"
import { TemplatesLibrary } from "./templates-library"

export function generateMetadata() {
  return buildPageMetadata(({ t }) => t.tplLibraryTitle)
}

/** Plan template library (計画テンプレート): any logged-in user. */
export default async function TemplatesPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")
  return (
    <div className="min-h-screen bg-surface-muted">
      <Header />
      <main id="main-content" className="page-wide">
        <TemplatesLibrary />
      </main>
    </div>
  )
}
