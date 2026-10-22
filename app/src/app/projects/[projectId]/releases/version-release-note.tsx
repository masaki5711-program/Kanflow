"use client"

import { useState } from "react"
import { useLanguage } from "@/lib/language-context"
import { useApiQuery } from "@/hooks"
import { AIResultModal } from "@/components/ai-result-modal"
import { Button, Modal } from "@/components/ui"
import { ClipboardCopy, FileText, Sparkles } from "lucide-react"

interface VersionNote {
  enabled: boolean
  text: string
  mergedCount: number
  description: string | null
}

interface Props {
  projectId: string
  version: string
}

/**
 * Release note of one version: the MRs merged from the previous tag to this
 * version's tag (to now while untagged), the GitLab release text when there is
 * one, a copy button and an AI summary. Loads only once the dialog is opened.
 */
export function VersionReleaseNote({ projectId, version }: Props) {
  const { t, language } = useLanguage()
  const [open, setOpen] = useState(false)
  const [showAi, setShowAi] = useState(false)
  const [copied, setCopied] = useState(false)
  const base = `/api/projects/${projectId}/releases/git`
  const query = `view=note&version=${encodeURIComponent(version)}&lang=${language}`
  const { data, isLoading } = useApiQuery<VersionNote>(open ? `${base}?${query}` : null, { toastOnError: () => t.releaseGitNoteLoadFailed })

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard can be blocked (insecure origin): the text stays selectable in the dialog.
    }
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)} leftIcon={<FileText aria-hidden className="h-4 w-4" />}>
        {t.releaseGitNote}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} variant="side" size="lg" title={t.releaseGitNoteTitle.replace("{version}", version)}
        footer={data?.enabled ? (
          <>
            <Button size="sm" variant="secondary" onClick={() => void copy(data.text)} leftIcon={<ClipboardCopy aria-hidden className="h-4 w-4" />}>
              {copied ? t.releaseGitNoteCopied : t.releaseGitNoteCopy}
            </Button>
            {data.mergedCount > 0 && (
              <Button size="sm" onClick={() => setShowAi(true)} leftIcon={<Sparkles aria-hidden className="h-4 w-4" />}>{t.releaseGitNoteAi}</Button>
            )}
          </>
        ) : undefined}>
        {isLoading && <p className="text-body text-fg-muted">{t.loading}</p>}
        {data?.enabled && (
          <div className="space-y-4">
            <pre className="whitespace-pre-wrap break-words font-sans text-body leading-relaxed text-fg">{data.text}</pre>
            {data.description && (
              <section aria-label={t.releaseGitNoteGitlab} className="border-t border-border pt-3">
                <h3 className="mb-1 text-caption font-semibold text-fg-muted">{t.releaseGitNoteGitlab}</h3>
                <pre className="whitespace-pre-wrap break-words font-sans text-body leading-relaxed text-fg">{data.description}</pre>
              </section>
            )}
          </div>
        )}
      </Modal>
      {showAi && (
        <AIResultModal title={t.releaseGitNoteAi} fetchUrl={`${base}/ai-summary`} fetchBody={{ version, lang: language }} onClose={() => setShowAi(false)} />
      )}
    </>
  )
}
