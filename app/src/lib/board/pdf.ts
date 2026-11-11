/**
 * A one-page PDF holding one JPEG picture, fitted into an A4 / A3 landscape or portrait page with a margin. Written
 * by hand (a PDF of one image needs five objects), so no library is downloaded and nothing leaves the browser. Pure.
 */

export type PaperSize = "a4" | "a3"

/** Page sizes in points (1/72 inch), portrait. */
const PAPER: Record<PaperSize, { w: number; h: number }> = {
  a4: { w: 595.28, h: 841.89 },
  a3: { w: 841.89, h: 1190.55 },
}

const MARGIN = 24

/** The page (landscape when the picture is wider than tall) and where the picture goes on it. */
export function pdfLayout(paper: PaperSize, imageW: number, imageH: number): { pageW: number; pageH: number; x: number; y: number; w: number; h: number } {
  const portrait = PAPER[paper]
  const landscape = imageW >= imageH
  const pageW = landscape ? portrait.h : portrait.w
  const pageH = landscape ? portrait.w : portrait.h
  const scale = Math.min((pageW - 2 * MARGIN) / Math.max(1, imageW), (pageH - 2 * MARGIN) / Math.max(1, imageH))
  const w = imageW * scale
  const h = imageH * scale
  return { pageW, pageH, x: (pageW - w) / 2, y: (pageH - h) / 2, w, h }
}

const f = (n: number) => (Math.round(n * 100) / 100).toString()

/** The PDF bytes. `jpeg` is a baseline JPEG of `imageW` × `imageH` pixels. */
export function imagePdf(jpeg: Uint8Array, imageW: number, imageH: number, paper: PaperSize, title = ""): Uint8Array<ArrayBuffer> {
  const page = pdfLayout(paper, imageW, imageH)
  const encoder = new TextEncoder()
  const chunks: Uint8Array[] = []
  const offsets: number[] = []
  let length = 0
  const push = (part: string | Uint8Array) => {
    const bytes = typeof part === "string" ? encoder.encode(part) : part
    chunks.push(bytes)
    length += bytes.length
  }
  const object = (id: number, body: string | Uint8Array[]) => {
    offsets[id] = length
    push(`${id} 0 obj\n`)
    if (typeof body === "string") push(body)
    else for (const part of body) push(part)
    push("\nendobj\n")
  }
  const content = `q ${f(page.w)} 0 0 ${f(page.h)} ${f(page.x)} ${f(page.y)} cm /Im0 Do Q`
  // Only printable ASCII in the title (the file name already carries the board's name).
  const safeTitle = title.replace(/[^\x20-\x7e]/g, "").replace(/[()\\]/g, "")

  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n")
  object(1, "<< /Type /Catalog /Pages 2 0 R >>")
  object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
  object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(page.pageW)} ${f(page.pageH)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`)
  object(4, [encoder.encode(`<< /Type /XObject /Subtype /Image /Width ${imageW} /Height ${imageH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`), jpeg, encoder.encode("\nendstream")])
  object(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`)
  object(6, `<< /Title (${safeTitle}) /Producer (Kanflow) >>`)
  const xref = length
  push(`xref\n0 7\n0000000000 65535 f \n`)
  for (let id = 1; id <= 6; id++) push(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`)
  push(`trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`)

  const out = new Uint8Array(length)
  let at = 0
  for (const chunk of chunks) {
    out.set(chunk, at)
    at += chunk.length
  }
  return out
}
