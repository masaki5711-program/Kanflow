const COLLABORA_URL = process.env.NEXT_PUBLIC_COLLABORA_URL ?? "http://localhost:9980"
const APP_EXTERNAL_URL = process.env.APP_EXTERNAL_URL ?? "http://host.docker.internal:3000"

export function isEditableInCollabora(mimeType: string): boolean {
  return (
    mimeType.includes("word") ||
    mimeType.includes("document") ||
    mimeType.includes("spreadsheet") ||
    mimeType.includes("excel") ||
    mimeType.includes("presentation") ||
    mimeType.includes("powerpoint")
  )
}

function getFileExtension(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    "application/vnd.ms-powerpoint": "ppt",
  }
  return mimeToExt[mimeType] ?? "xlsx"
}

export async function getCollaboraEditorUrl(
  projectId: string,
  attachmentId: string,
  mimeType: string
): Promise<{ editorUrl: string; wopiSrc: string }> {
  const fileId = `${projectId}_${attachmentId}`
  const wopiSrc = `${APP_EXTERNAL_URL}/api/wopi/files/${fileId}`

  const ext = getFileExtension(mimeType)

  const discoveryUrl = `${COLLABORA_URL}/hosting/discovery`
  const response = await fetch(discoveryUrl)
  if (!response.ok) {
    throw new Error("Failed to fetch Collabora discovery XML")
  }

  const xml = await response.text()

  const editPattern = new RegExp(
    `<action[^>]*ext="${ext}"[^>]*name="edit"[^>]*urlsrc="([^"]*)"` +
    `|<action[^>]*name="edit"[^>]*ext="${ext}"[^>]*urlsrc="([^"]*)"`,
  )
  const rawMatch = xml.match(editPattern)
  const match = rawMatch ? [rawMatch[0], rawMatch[1] ?? rawMatch[2]] : null

  let editorBaseUrl: string
  if (match) {
    editorBaseUrl = match[1]
  } else {
    const anyPattern = /<action[^>]*name="edit"[^>]*urlsrc="([^"]*)"/
    const anyMatch = xml.match(anyPattern)
    if (anyMatch) {
      editorBaseUrl = anyMatch[1]
    } else {
      throw new Error(`No editor URL found for extension: ${ext}`)
    }
  }

  // Collabora may return https:// URLs even when SSL is disabled.
  // Replace with the configured COLLABORA_URL scheme to avoid SSL errors.
  const collaboraOrigin = new URL(COLLABORA_URL).origin
  editorBaseUrl = editorBaseUrl.replace(/^https?:\/\/[^/]+/, collaboraOrigin)

  const editorUrl = `${editorBaseUrl}WOPISrc=${encodeURIComponent(wopiSrc)}&lang=ja`

  return { editorUrl, wopiSrc }
}
