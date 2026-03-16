"use client"

import { useRouter, useParams } from "next/navigation"
import { CollaboraEditor } from "@/components/collabora-editor"

export default function EditorPage() {
  const router = useRouter()
  const params = useParams()
  const projectId = params.projectId as string
  const attachmentId = params.attachmentId as string

  return (
    <CollaboraEditor
      projectId={projectId}
      attachmentId={attachmentId}
      onClose={() => router.push(`/projects/${projectId}`)}
    />
  )
}
