"use client"

import { useRouter, useParams } from "next/navigation"
import { CollaboraEditor } from "@/components/collabora-editor"
import { VisuallyHidden } from "@/components/ui"
import { useProjectDocumentTitle } from "@/components/app-shell/project-title-context"
import { useLanguage } from "@/lib/language-context"

export default function EditorPage() {
  const router = useRouter()
  const params = useParams()
  const { t } = useLanguage()
  useProjectDocumentTitle(t.editorTitle)
  const projectId = params.projectId as string
  const attachmentId = params.attachmentId as string

  return (
    <>
      {/* Full-screen editor: the page heading is for assistive tech only. */}
      <VisuallyHidden as="h1">{t.editorTitle}</VisuallyHidden>
      <CollaboraEditor
        projectId={projectId}
        attachmentId={attachmentId}
        onClose={() => router.push(`/projects/${projectId}`)}
      />
    </>
  )
}
