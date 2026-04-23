/**
 * Client-side image compression via Canvas.
 * Resizes the image so its longest edge is at most `maxEdge` pixels and
 * re-encodes it as JPEG at the given quality. PNGs with transparency
 * are kept as PNG to avoid loss of alpha.
 *
 * Returns the original File unchanged for non-image inputs or when the
 * result would not be smaller.
 */
export async function compressImageFile(
  file: File,
  options: { maxEdge?: number; quality?: number } = {}
): Promise<File> {
  const { maxEdge = 1920, quality = 0.82 } = options

  if (!file.type.startsWith("image/")) return file
  // GIFs would lose animation frames if re-encoded via canvas.
  if (file.type === "image/gif") return file
  // SVG: vector, no benefit
  if (file.type === "image/svg+xml") return file

  const preservePng = file.type === "image/png"
  const outType = preservePng ? "image/png" : "image/jpeg"

  try {
    const bitmap = await createImageBitmap(file)
    const { width, height } = bitmap
    const longEdge = Math.max(width, height)

    const scale = longEdge > maxEdge ? maxEdge / longEdge : 1
    const targetW = Math.round(width * scale)
    const targetH = Math.round(height * scale)

    const canvas = document.createElement("canvas")
    canvas.width = targetW
    canvas.height = targetH
    const ctx = canvas.getContext("2d")
    if (!ctx) return file

    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = "high"
    ctx.drawImage(bitmap, 0, 0, targetW, targetH)
    bitmap.close?.()

    const blob: Blob | null = await new Promise((resolve) => {
      canvas.toBlob(resolve, outType, preservePng ? undefined : quality)
    })
    if (!blob) return file

    // Skip if compression did not actually shrink the file
    if (blob.size >= file.size) return file

    const newName = replaceExtension(file.name, preservePng ? ".png" : ".jpg")
    return new File([blob], newName, { type: outType, lastModified: Date.now() })
  } catch {
    return file
  }
}

function replaceExtension(name: string, newExt: string): string {
  const dot = name.lastIndexOf(".")
  if (dot <= 0) return name + newExt
  return name.slice(0, dot) + newExt
}
