import os from "os"
import path from "path"
import fsSync from "fs"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { readHead, writeStreamToFile } from "../stream-write"

let dir: string

beforeAll(() => {
  dir = fsSync.mkdtempSync(path.join(os.tmpdir(), "kanflow-stream-write-"))
})

afterAll(() => {
  fsSync.rmSync(dir, { recursive: true, force: true })
})

function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c))
      controller.close()
    },
  })
}

function failingStream(first: string): ReadableStream<Uint8Array> {
  let sent = false
  return new ReadableStream({
    pull(controller) {
      if (sent) {
        controller.error(new Error("client aborted"))
        return
      }
      sent = true
      controller.enqueue(new TextEncoder().encode(first))
    },
  })
}

describe("readHead", () => {
  it("collects chunks until the requested size and keeps them for writing", async () => {
    const reader = streamOf("abc", "def", "ghi").getReader()
    const head = await readHead(reader, 5)
    expect(new TextDecoder().decode(head.head)).toBe("abcde")
    expect(head.chunks.map((c) => new TextDecoder().decode(c))).toEqual(["abc", "def"])
    expect(head.bytes).toBe(6)
    expect(head.done).toBe(false)
  })

  it("stops at end of stream for short inputs", async () => {
    const head = await readHead(streamOf("hi").getReader(), 100)
    expect(new TextDecoder().decode(head.head)).toBe("hi")
    expect(head.done).toBe(true)
  })
})

describe("writeStreamToFile", () => {
  it("writes the head chunks and the rest of the stream, returning the byte count", async () => {
    const reader = streamOf("abc", "def", "ghi").getReader()
    const head = await readHead(reader, 3)
    const target = path.join(dir, "ok.txt")
    await expect(writeStreamToFile(target, head, reader, 100)).resolves.toEqual({ ok: true, bytes: 9 })
    expect(fsSync.readFileSync(target, "utf8")).toBe("abcdefghi")
  })

  it("aborts and removes the partial file once the size limit is passed", async () => {
    const reader = streamOf("aaaa", "bbbb", "cccc").getReader()
    const head = await readHead(reader, 4)
    const target = path.join(dir, "big.txt")
    await expect(writeStreamToFile(target, head, reader, 6)).resolves.toEqual({ ok: false, reason: "too_large" })
    expect(fsSync.existsSync(target)).toBe(false)
  })

  it("removes the partial file and rethrows when the stream fails", async () => {
    const reader = failingStream("abc").getReader()
    const head = await readHead(reader, 3)
    const target = path.join(dir, "broken.txt")
    await expect(writeStreamToFile(target, head, reader, 100)).rejects.toThrow("client aborted")
    expect(fsSync.existsSync(target)).toBe(false)
  })

  it("never overwrites an existing file", async () => {
    const target = path.join(dir, "exists.txt")
    fsSync.writeFileSync(target, "keep")
    const reader = streamOf("new").getReader()
    const head = await readHead(reader, 3)
    await expect(writeStreamToFile(target, head, reader, 100)).rejects.toMatchObject({ code: "EEXIST" })
    expect(fsSync.readFileSync(target, "utf8")).toBe("keep")
  })
})
