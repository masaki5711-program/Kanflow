/**
 * Accept an uploaded .xlsx for the backlog import: size limit, extension and
 * magic bytes (lib/upload/file-type.ts — the browser MIME type is not trusted).
 */
import { HEAD_BYTES, extensionOf, verifyFileType } from "@/lib/upload/file-type"
import { StatusError, ValidationError } from "@/services/_shared/errors"
import { IMPORT_MAX_BYTES } from "./backlog.import"
import { inspectZip } from "./zip-guard"

/** Multipart overhead allowed on top of the file itself before reading the body. */
const MULTIPART_SLACK = 64 * 1024

/** Reject an oversized request from its Content-Length before the body is parsed. */
export function assertImportRequestSize(request: Request): void {
  const declared = Number(request.headers.get("content-length") ?? "")
  if (Number.isFinite(declared) && declared > IMPORT_MAX_BYTES + MULTIPART_SLACK) {
    throw new StatusError(413, "ファイルサイズが上限を超えています", { maxBytes: IMPORT_MAX_BYTES }, "PAYLOAD_TOO_LARGE")
  }
}

/** The uploaded workbook's bytes, or a 400 / 413 / 415 ServiceError. */
export async function readUploadedXlsx(file: FormDataEntryValue | null): Promise<Buffer> {
  if (!file || typeof file === "string") throw new ValidationError("ファイルがありません", {}, "FILE_REQUIRED")
  if (file.size <= 0) throw new ValidationError("ファイルが空です", {}, "FILE_EMPTY")
  if (file.size > IMPORT_MAX_BYTES) {
    throw new StatusError(413, "ファイルサイズが上限を超えています", { maxBytes: IMPORT_MAX_BYTES }, "PAYLOAD_TOO_LARGE")
  }
  if (extensionOf(file.name) !== "xlsx") throw new StatusError(415, "xlsx ファイルを選択してください", {}, "UNSUPPORTED_MEDIA")
  const buffer = Buffer.from(await file.arrayBuffer())
  if (buffer.length > IMPORT_MAX_BYTES) {
    throw new StatusError(413, "ファイルサイズが上限を超えています", { maxBytes: IMPORT_MAX_BYTES }, "PAYLOAD_TOO_LARGE")
  }
  if (!verifyFileType(file.name, buffer.subarray(0, HEAD_BYTES)).ok) {
    throw new StatusError(415, "ファイルの内容が拡張子と一致しません", {}, "FILE_TYPE_MISMATCH")
  }
  // Before exceljs inflates anything: reject zip bombs from the central directory.
  const zip = inspectZip(buffer)
  if (!zip.ok) {
    throw new StatusError(413, "ファイルの展開後サイズが上限を超えているか、形式が不正です", { reason: zip.reason }, "PAYLOAD_TOO_LARGE")
  }
  return buffer
}
