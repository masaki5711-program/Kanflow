"use client"

import { useState } from "react"
import { useLanguage } from "@/lib/language-context"
import { useApiQuery } from "@/hooks"
import { AIResultModal } from "@/components/ai-result-modal"
import { Button, Modal } from "@/components/ui"
import { ClipboardCopy, FileText, Sparkles } from "lucide-react"

interface ReleaseNote {
  enabled: boolean
  text: string
  mergedCount: number
}

interface Props {
  projectId: string
  sprintId: string
  sprintName: string
}

/**
 * Release note of a sprint, built from the merge requests merged during it
 * (copyable Markdown) plus an AI summary for the sprint review. Renders
 * nothing when Git is off for the project.
 */
export default function ReleaseNoteButton({ projectId, sprintId, sprintName }: Props) {
  const { t, language } = useLanguage()
  const [open, setOpen] = useState(false)
  const [showAi, setShowAi] = useState(false)
  const [copied, setCopied] = useState(false)
  const base = `/api/projects/${projectId}/sprints/${sprintId}`
  const { data } = useApiQuery<ReleaseNote>(`${base}/git?view=release&lang=${language}`)

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard can be blocked (insecure origin): the text stays selectable in the dialog.
    }
  }

  if (!data?.enabled) return null

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)} leftIcon={<FileText aria-hidden className="h-4 w-4" />}>
        {t.sprintUxReleaseNote}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} variant="side" size="lg" title={t.sprintUxReleaseTitle.replace("{sprint}", sprintName)}
        footer={(
          <>
            <Button size="sm" variant="secondary" onClick={() => void copy(data.text)} leftIcon={<ClipboardCopy aria-hidden className="h-4 w-4" />}>
              {copied ? t.sprintUxReleaseCopied : t.sprintUxReleaseCopy}
            </Button>
            {data.mergedCount > 0 && (
              <Button size="sm" onClick={() => setShowAi(true)} leftIcon={<Sparkles aria-hidden className="h-4 w-4" />}>{t.sprintUxReleaseAi}</Button>
            )}
          </>
        )}>
        <pre className="whitespace-pre-wrap break-words font-sans text-body leading-relaxed text-fg">{data.text}</pre>
      </Modal>
      {showAi && (
        <AIResultModal title={t.sprintUxReleaseAi} fetchUrl={`${base}/ai/release-summary`} fetchBody={{ lang: language }} onClose={() => setShowAi(false)} />
      )}
    </>
  )
}
