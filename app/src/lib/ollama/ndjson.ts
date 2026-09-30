/**
 * Parse a newline-delimited JSON byte stream into objects.
 *
 * - Lines may be split across chunks at any byte (including inside a
 *   multi-byte UTF-8 character); a trailing line without "\n" is parsed too.
 * - Blank and malformed lines are skipped.
 * - When `signal` aborts, or the consumer stops iterating early, the reader
 *   is cancelled so the upstream connection closes and Ollama stops
 *   generating.
 */
export async function* parseNdjson<T = unknown>(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal
): AsyncGenerator<T, void, undefined> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let finished = false
  const onAbort = () => {
    reader.cancel(signal?.reason).catch(() => undefined)
  }
  if (signal?.aborted) onAbort()
  else signal?.addEventListener("abort", onAbort, { once: true })

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""
      for (const line of lines) {
        const parsed = parseLine<T>(line)
        if (parsed !== undefined) yield parsed
      }
    }
    finished = true
    if (signal?.aborted) throw signal.reason
    const tail = parseLine<T>(buffer + decoder.decode())
    if (tail !== undefined) yield tail
  } finally {
    signal?.removeEventListener("abort", onAbort)
    if (!finished) await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

function parseLine<T>(line: string): T | undefined {
  const trimmed = line.trim()
  if (!trimmed) return undefined
  try {
    return JSON.parse(trimmed) as T
  } catch {
    return undefined
  }
}
