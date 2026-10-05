import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { Header } from "@/components/header"
import { buildPageMetadata } from "@/app/page-metadata"
import { TemplateEditor } from "../template-editor"

export function generateMetadata() {
  return buildPageMetadata(({ t }) => t.tplEditorTitleEdit)
}

/** Edit one plan template (visibility / delete rules are enforced by the API). */
export default async function TemplateEditPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")
  const { id } = await params
  return (
    <div className="min-h-screen bg-surface-muted">
      <Header />
      <main id="main-content" className="page-wide">
        <TemplateEditor key={id} id={id} />
      </main>
    </div>
  )
}
