import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { Header } from "@/components/header"
import { buildPageMetadata } from "@/app/page-metadata"
import { LessonsView } from "@/components/feedback/lessons-view"

export function generateMetadata() {
  return buildPageMetadata(({ t }) => t.feedbackTitle)
}

/** Lessons learned from reported failures (W11): everyone reads the confirmed ones; maintainers / SMs curate. */
export default async function FeedbackPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")
  return (
    <div className="min-h-screen bg-surface-muted">
      <Header />
      <main id="main-content" className="page-wide">
        <LessonsView />
      </main>
    </div>
  )
}
