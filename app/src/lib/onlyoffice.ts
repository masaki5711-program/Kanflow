import jwt from "jsonwebtoken"

const JWT_SECRET = process.env.ONLYOFFICE_JWT_SECRET
if (!JWT_SECRET) {
  console.warn("ONLYOFFICE_JWT_SECRET is not set — OnlyOffice editing will be unavailable")
}
const APP_EXTERNAL_URL = process.env.APP_EXTERNAL_URL ?? "http://host.docker.internal:3000"

type DocumentType = "word" | "cell" | "slide"

interface AttachmentInfo {
  id: string
  fileName: string
  originalName: string
  mimeType: string
  updatedAt: Date
}

function getDocumentType(mimeType: string): DocumentType | null {
  if (mimeType.includes("word") || mimeType.includes("document")) return "word"
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) return "cell"
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) return "slide"
  return null
}

function getFileType(mimeType: string, fileName: string): string {
  const mimeToExt: Record<string, string> = {
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    "application/vnd.ms-powerpoint": "ppt",
  }
  if (mimeToExt[mimeType]) return mimeToExt[mimeType]
  const parts = fileName.split(".")
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : ""
}

export function isEditableInOnlyOffice(mimeType: string): boolean {
  return getDocumentType(mimeType) !== null
}

export function buildEditorConfig(
  attachment: AttachmentInfo,
  projectId: string,
  userId: string,
  userName: string
) {
  const documentType = getDocumentType(attachment.mimeType)
  if (!documentType) {
    throw new Error("Unsupported file type for OnlyOffice editing")
  }

  const documentKey = `${attachment.id}_${Date.now()}`
  const documentUrl = `${APP_EXTERNAL_URL}/api/projects/${projectId}/attachments/${attachment.id}/download?oo=1`
  const callbackUrl = `${APP_EXTERNAL_URL}/api/onlyoffice/callback?projectId=${projectId}&attachmentId=${attachment.id}`

  const config = {
    document: {
      fileType: getFileType(attachment.mimeType, attachment.originalName),
      key: documentKey,
      title: attachment.originalName,
      url: documentUrl,
    },
    documentType,
    editorConfig: {
      callbackUrl,
      lang: "ja",
      mode: "edit",
      user: {
        id: userId,
        name: userName,
      },
      customization: {
        forcesave: true,
      },
    },
  }

  if (!JWT_SECRET) {
    throw new Error("ONLYOFFICE_JWT_SECRET environment variable is required")
  }
  const token = jwt.sign(config, JWT_SECRET)

  return {
    ...config,
    token,
  }
}
