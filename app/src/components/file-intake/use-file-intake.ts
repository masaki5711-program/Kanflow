"use client"

import { useCallback, useRef, useState, type ClipboardEvent, type DragEvent } from "react"

/** A pasted screenshot arrives as "image.png": give it a readable, unique name. */
export function namePastedFile(file: File, now: Date = new Date()): File {
  if (!/^image\.(png|jpe?g|gif|webp)$/i.test(file.name)) return file
  const pad = (n: number) => String(n).padStart(2, "0")
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  const ext = file.name.split(".").pop() ?? "png"
  return new File([file], `screenshot-${stamp}.${ext}`, { type: file.type, lastModified: file.lastModified })
}

/**
 * Files from a drop or a paste (Ctrl+V of a screenshot). `onFiles` gets the
 * files; text paste is left alone so typing in the textarea keeps working.
 */
export function useFileIntake(onFiles: (files: File[]) => void, disabled = false) {
  const [dragActive, setDragActive] = useState(false)
  const depth = useRef(0)
  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files")

  const dropProps = {
    onDragEnter: (e: DragEvent) => {
      if (disabled || !hasFiles(e)) return
      e.preventDefault()
      depth.current += 1
      setDragActive(true)
    },
    onDragOver: (e: DragEvent) => {
      if (disabled || !hasFiles(e)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = "copy"
    },
    onDragLeave: (e: DragEvent) => {
      if (disabled || !hasFiles(e)) return
      depth.current = Math.max(0, depth.current - 1)
      if (depth.current === 0) setDragActive(false)
    },
    onDrop: (e: DragEvent) => {
      if (disabled || !hasFiles(e)) return
      e.preventDefault()
      depth.current = 0
      setDragActive(false)
      const files = Array.from(e.dataTransfer.files)
      if (files.length > 0) onFiles(files)
    },
  }

  const onPaste = useCallback(
    (e: ClipboardEvent) => {
      if (disabled) return
      const files = Array.from(e.clipboardData?.files ?? [])
      if (files.length === 0) return
      e.preventDefault()
      onFiles(files.map((f) => namePastedFile(f)))
    },
    [disabled, onFiles],
  )

  return { dragActive, dropProps, onPaste }
}
