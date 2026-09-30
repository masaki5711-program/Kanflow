"use client"

import { useEffect, useRef } from "react"
import { Button, Spinner, buttonClasses } from "@/components/ui"
import { isApiError, useApiQuery } from "@/hooks"
import { useLanguage } from "@/lib/language-context"

interface CollaboraEditorProps {
  projectId: string
  attachmentId: string
  onClose: () => void
}

interface EditorConfig {
  editorUrl: string
  accessToken: string
  accessTokenTtl: number
}

function parseEditorConfig(raw: unknown): EditorConfig {
  const rec = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>
  if (typeof rec.accessToken !== "string" || !rec.accessToken || typeof rec.editorUrl !== "string") {
    throw new Error("")
  }
  return {
    editorUrl: rec.editorUrl,
    accessToken: rec.accessToken,
    accessTokenTtl: typeof rec.accessTokenTtl === "number" ? rec.accessTokenTtl : 0,
  }
}

/** Offline fallback the server may attach to an error: download the original file instead. */
function fallbackFrom(error: Error | null): { url: string; name: string } | null {
  if (!isApiError(error) || typeof error.body !== "object" || error.body === null) return null
  const body = error.body as Record<string, unknown>
  if (typeof body.downloadUrl !== "string") return null
  return { url: body.downloadUrl, name: typeof body.originalName === "string" ? body.originalName : "download" }
}

export function CollaboraEditor({ projectId, attachmentId, onClose }: CollaboraEditorProps) {
  const { t } = useLanguage()
  const { data: config, error, isLoading } = useApiQuery<EditorConfig>(
    `/api/projects/${projectId}/attachments/${attachmentId}/editor-config`,
    { parse: parseEditorConfig },
  )
  const editorUrl = config?.editorUrl ?? null
  const fallbackDownload = fallbackFrom(error)
  const formRef = useRef<HTMLFormElement>(null)
  const submittedRef = useRef(false)

  useEffect(() => {
    if (editorUrl && formRef.current && !submittedRef.current) {
      submittedRef.current = true
      formRef.current.submit()
    }
  }, [editorUrl])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface">
      <div className="flex items-center justify-between border-b border-border px-4 py-2 bg-surface-muted">
        <Button variant="secondary" size="sm" onClick={onClose} leftIcon={<span aria-hidden="true">&larr;</span>}>
          {t.back}
        </Button>
        <span role="status" aria-live="polite" className="inline-flex items-center gap-2 text-body text-fg-muted">
          {isLoading && <Spinner size="sm" />}
          {isLoading ? t.editorLoading : ""}
        </span>
      </div>

      {error && !config && (
        <div className="flex items-center justify-center flex-1">
          <div className="text-center max-w-lg px-6">
            <p role="alert" className="text-danger mb-4 whitespace-pre-wrap">{error.message || t.editorError}</p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {fallbackDownload && (
                <a
                  href={`${fallbackDownload.url}?download`}
                  download={fallbackDownload.name}
                  className={buttonClasses({ variant: "secondary" })}
                >
                  {t.dashboardDownloadNamed.replace("{name}", fallbackDownload.name)}
                </a>
              )}
              <Button onClick={onClose}>{t.back}</Button>
            </div>
          </div>
        </div>
      )}

      {config && (
        <>
          <form
            ref={formRef}
            action={config.editorUrl}
            method="POST"
            target="collabora-frame"
            className="hidden"
          >
            <input type="hidden" name="access_token" value={config.accessToken} />
            <input type="hidden" name="access_token_ttl" value={String(config.accessTokenTtl)} />
          </form>
          <iframe
            name="collabora-frame"
            title={t.edit}
            className="flex-1 w-full border-0"
            allow="clipboard-read; clipboard-write"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
          />
        </>
      )}
    </div>
  )
}
