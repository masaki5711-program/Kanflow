"use client"

import { useEffect, useRef, useState } from "react"
import { useLanguage } from "@/lib/language-context"

interface OnlyOfficeEditorProps {
  projectId: string
  attachmentId: string
  onClose: () => void
}

declare global {
  interface Window {
    DocsAPI?: {
      DocEditor: new (elementId: string, config: Record<string, unknown>) => {
        destroyEditor: () => void
      }
    }
  }
}

export function OnlyOfficeEditor({ projectId, attachmentId, onClose }: OnlyOfficeEditorProps) {
  const { t } = useLanguage()
  const editorRef = useRef<{ destroyEditor: () => void } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const initializedRef = useRef(false)

  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true

    const onlyofficeUrl = process.env.NEXT_PUBLIC_ONLYOFFICE_URL ?? "http://localhost:8443"

    // Create a DOM element outside React's control
    const editorDiv = document.createElement("div")
    editorDiv.id = "onlyoffice-editor-instance"
    editorDiv.style.width = "100%"
    editorDiv.style.height = "100%"

    if (containerRef.current) {
      containerRef.current.appendChild(editorDiv)
    }

    async function initEditor() {
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

        const script = document.createElement("script")
        script.src = `${onlyofficeUrl}/web-apps/apps/api/documents/api.js`
        script.onload = () => {
          if (window.DocsAPI) {
            editorRef.current = new window.DocsAPI.DocEditor("onlyoffice-editor-instance", {
              ...config,
              width: "100%",
              height: "100%",
              events: {
                onAppReady: () => setLoading(false),
                onError: (event: { data?: { errorCode?: number; errorDescription?: string } }) => {
                  const code = event?.data?.errorCode ?? "unknown"
                  const desc = event?.data?.errorDescription ?? ""
                  console.error("OnlyOffice error:", code, desc, event)
                  setError(`${t.editorError} (code: ${code})${desc ? `: ${desc}` : ""}`)
                },
                onDocumentStateChange: (event: { data?: boolean }) => {
                  console.log("Document state changed, modified:", event?.data)
                },
              },
            })
          } else {
            setError("OnlyOffice API not available")
            setLoading(false)
          }
        }
        script.onerror = () => {
          setError("OnlyOffice Document Server connection failed. Please check if the server is running.")
          setLoading(false)
        }
        document.head.appendChild(script)
      } catch {
        setError("Failed to initialize editor")
        setLoading(false)
      }
    }

    initEditor()

    return () => {
      if (editorRef.current) {
        try {
          editorRef.current.destroyEditor()
        } catch {
          // ignore cleanup errors
        }
      }
      // Clean up the manually created div
      if (containerRef.current && editorDiv.parentNode === containerRef.current) {
        containerRef.current.removeChild(editorDiv)
      }
    }
  }, [projectId, attachmentId])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <div className="flex items-center justify-between border-b px-4 py-2 bg-gray-50">
        <button
          onClick={onClose}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-200 hover:bg-gray-300 rounded transition-colors"
        >
          ← {t.back}
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

      <div
        ref={containerRef}
        className="flex-1"
        style={{ display: error ? "none" : "block" }}
      />
    </div>
  )
}
