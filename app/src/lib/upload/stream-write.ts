import fs from "fs/promises"

/**
 * Chunked upload writing: the file is read from `File.stream()` and written
 * piece by piece, so the whole upload is never copied into one Buffer, and
 * the byte count is enforced while writing (the declared size is not trusted).
 */

type ByteReader = ReadableStreamDefaultReader<Uint8Array>

export interface HeadRead {
  /** First `size` bytes (fewer when the stream is shorter). */
  head: Uint8Array
  /** Every chunk consumed so far (may extend past `size`); written first. */
  chunks: readonly Uint8Array[]
  bytes: number
  done: boolean
}

export type StreamWriteResult = { ok: true; bytes: number } | { ok: false; reason: "too_large" }

function concat(chunks: readonly Uint8Array[], limit: number): Uint8Array {
  const out = new Uint8Array(Math.min(limit, chunks.reduce((n, c) => n + c.byteLength, 0)))
  let offset = 0
  for (const c of chunks) {
    if (offset >= out.length) break
    const part = c.subarray(0, out.length - offset)
    out.set(part, offset)
    offset += part.byteLength
  }
  return out
}

/** Read chunks until at least `size` bytes (or the end) for signature checks. */
export async function readHead(reader: ByteReader, size: number): Promise<HeadRead> {
  const chunks: Uint8Array[] = []
  let bytes = 0
  while (bytes < size) {
    const { done, value } = await reader.read()
    if (done) return { head: concat(chunks, size), chunks, bytes, done: true }
    chunks.push(value)
    bytes += value.byteLength
  }
  return { head: concat(chunks, size), chunks, bytes, done: false }
}

async function removeQuietly(target: string): Promise<void> {
  await fs.rm(target, { force: true }).catch(() => undefined)
}

/**
 * Write the already-read head chunks plus the rest of `reader` to a NEW file
 * (`wx`: never overwrites). Over `maxBytes` → partial file removed,
 * `too_large`. Stream / disk errors → partial file removed, error rethrown.
 */
export async function writeStreamToFile(
  target: string,
  head: HeadRead,
  reader: ByteReader,
  maxBytes: number
): Promise<StreamWriteResult> {
  const fh = await fs.open(target, "wx")
  let bytes = head.bytes
  try {
    if (bytes > maxBytes) return await abort(fh, target, reader)
    for (const chunk of head.chunks) await fh.write(chunk)
    for (let next = head.done ? null : await reader.read(); next && !next.done; next = await reader.read()) {
      bytes += next.value.byteLength
      if (bytes > maxBytes) return await abort(fh, target, reader)
      await fh.write(next.value)
    }
    await fh.close()
    return { ok: true, bytes }
  } catch (error) {
    await fh.close().catch(() => undefined)
    await removeQuietly(target)
    throw error
  }
}

async function abort(fh: fs.FileHandle, target: string, reader: ByteReader): Promise<StreamWriteResult> {
  await reader.cancel().catch(() => undefined)
  await fh.close()
  await removeQuietly(target)
  return { ok: false, reason: "too_large" }
}
