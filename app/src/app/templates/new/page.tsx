import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { Header } from "@/components/header"
import { buildPageMetadata } from "@/app/page-metadata"
import { TemplateEditor } from "../template-editor"

export function generateMetadata() {
  return buildPageMetadata(({ t }) => t.tplEditorTitleNew)
}

/** Create a plan template from scratch. */
export default async function NewTemplatePage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")
  return (
    <div className="min-h-screen bg-surface-muted">
      <Header />
      <main id="main-content" className="page-wide">
        <TemplateEditor id={null} />
      </main>
    </div>
  )
}
