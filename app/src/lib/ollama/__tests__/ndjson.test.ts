import { describe, expect, test } from "vitest"
import { parseNdjson } from "../ndjson"

function streamOf(parts: Uint8Array[]): { stream: ReadableStream<Uint8Array>; cancelled: () => boolean } {
  let cancelled = false
  let i = 0
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < parts.length) controller.enqueue(parts[i++])
      else controller.close()
    },
    cancel() {
      cancelled = true
    },
  })
  return { stream, cancelled: () => cancelled }
}

const enc = new TextEncoder()

async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = []
  for await (const v of it) out.push(v)
  return out
}

describe("parseNdjson", () => {
  test("parses lines split across chunk boundaries", async () => {
    const text = '{"a":1}\n{"a":2}\n{"a":3}\n'
    const parts = [text.slice(0, 3), text.slice(3, 9), text.slice(9, 10), text.slice(10)].map((s) => enc.encode(s))
    const { stream } = streamOf(parts)
    expect(await collect(parseNdjson(stream))).toEqual([{ a: 1 }, { a: 2 }, { a: 3 }])
  })

  test("handles a multi-byte UTF-8 character split between chunks", async () => {
    const bytes = enc.encode('{"t":"日本"}\n')
    const cut = bytes.indexOf(0xe6) + 1 // inside the first 3-byte character
    const { stream } = streamOf([bytes.slice(0, cut), bytes.slice(cut)])
    expect(await collect(parseNdjson(stream))).toEqual([{ t: "日本" }])
  })

  test("parses a trailing line without newline and skips blank / malformed lines", async () => {
    const { stream } = streamOf([enc.encode('\n{"a":1}\nnot json\n\n{"a":2}')])
    expect(await collect(parseNdjson(stream))).toEqual([{ a: 1 }, { a: 2 }])
  })

  test("early exit by the consumer cancels the upstream reader", async () => {
    const { stream, cancelled } = streamOf([enc.encode('{"a":1}\n'), enc.encode('{"a":2}\n')])
    for await (const v of parseNdjson<{ a: number }>(stream)) {
      expect(v.a).toBe(1)
      break
    }
    expect(cancelled()).toBe(true)
  })

  test("abort signal cancels the upstream and rethrows the reason", async () => {
    let cancelled = false
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(enc.encode('{"a":1}\n'))
        // never closes: simulates a model still generating
      },
      cancel() {
        cancelled = true
      },
    })
    const ac = new AbortController()
    const seen: unknown[] = []
    const run = (async () => {
      for await (const v of parseNdjson(stream, ac.signal)) {
        seen.push(v)
        ac.abort(new Error("stop"))
      }
    })()
    await expect(run).rejects.toThrow("stop")
    expect(seen).toEqual([{ a: 1 }])
    expect(cancelled).toBe(true)
  })
})
