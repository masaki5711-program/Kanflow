"use client"

import { useEffect, useRef, useState } from "react"
import { useLanguage } from "@/lib/language-context"

interface CollaboraEditorProps {
  projectId: string
  attachmentId: string
  onClose: () => void
}

export function CollaboraEditor({ projectId, attachmentId, onClose }: CollaboraEditorProps) {
  const { t } = useLanguage()
  const [editorUrl, setEditorUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const submittedRef = useRef(false)

  useEffect(() => {
    async function loadEditor() {
      try {
        const res = await fetch(
          `/api/projects/${projectId}/attachments/${attachmentId}/editor-config`
        )
        if (!res.ok) {
          const err = await res.json()
          setError(err.error ?? "Failed to load editor config")
          setLoading(false)
          return
        }

        const config = await res.json()
        setEditorUrl(config.editorUrl)
        setLoading(false)
      } catch {
        setError("Failed to initialize editor")
        setLoading(false)
      }
    }

    loadEditor()
  }, [projectId, attachmentId])

  useEffect(() => {
    if (editorUrl && formRef.current && !submittedRef.current) {
      submittedRef.current = true
      formRef.current.submit()
    }
  }, [editorUrl])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <div className="flex items-center justify-between border-b px-4 py-2 bg-gray-50">
        <button
          onClick={onClose}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-200 hover:bg-gray-300 rounded transition-colors"
        >
          &larr; {t.back}
        </button>
        {loading && <span className="text-sm text-gray-500">{t.editorLoading}</span>}
      </div>

      {error && (
        <div className="flex items-center justify-center flex-1">
          <div className="text-center">
            <p className="text-red-600 mb-4">{error}</p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              {t.back}
            </button>
          </div>
        </div>
      )}

      {editorUrl && !error && (
        <>
          <form
            ref={formRef}
            action={editorUrl}
            method="POST"
            target="collabora-frame"
            className="hidden"
          >
            <input type="hidden" name="access_token" value="collabora-token" />
          </form>
          <iframe
            name="collabora-frame"
            className="flex-1 w-full border-0"
            allow="clipboard-read; clipboard-write"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
          />
        </>
      )}
    </div>
  )
}
