import { StatusError } from "@/services/_shared/errors"

/**
 * Reads a JSON request body of at most `maxBytes`. The declared length is refused up front and the stream
 * is cut at the limit, so a body without (or with a wrong) Content-Length is never buffered whole.
 * Throws 413 BOARD_WRITE_TOO_LARGE; a body that is not JSON throws SyntaxError (→ 400 INVALID_JSON).
 */
export async function readBoundedJson(request: Request, maxBytes: number): Promise<unknown> {
  const tooLarge = () => new StatusError(413, "Request body too large", { maxBytes }, "BOARD_WRITE_TOO_LARGE")
  const declared = Number(request.headers.get("content-length") ?? "")
  if (Number.isFinite(declared) && declared > maxBytes) throw tooLarge()
  if (!request.body) return JSON.parse("")

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      await reader.cancel()
      throw tooLarge()
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return JSON.parse(new TextDecoder().decode(bytes))
}
