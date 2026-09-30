"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { flushSync } from "react-dom"
import type { PrintScope } from "../lib/print"
import type { ChartRange } from "../lib/scale"

export interface PrintRequest {
  scope: PrintScope
  /** The visible days when scope = "visible" (captured when printing starts). */
  visible: ChartRange | null
}

/**
 * Print flow of the plan: while a request is active the chart renders its
 * print layout (fitted range). `print(scope)` renders it synchronously and
 * opens the browser dialog; a browser-initiated print (Ctrl+P) prints the
 * whole plan. The request ends on `afterprint`.
 */
export function usePlanPrint(visibleRange: () => ChartRange) {
  const [request, setRequest] = useState<PrintRequest | null>(null)
  const activeRef = useRef(false)

  const print = useCallback(
    (scope: PrintScope) => {
      activeRef.current = true
      flushSync(() => setRequest({ scope, visible: scope === "visible" ? visibleRange() : null }))
      window.print()
    },
    [visibleRange],
  )

  useEffect(() => {
    const before = () => {
      if (activeRef.current) return
      activeRef.current = true
      flushSync(() => setRequest({ scope: "all", visible: null }))
    }
    const after = () => {
      activeRef.current = false
      setRequest(null)
    }
    window.addEventListener("beforeprint", before)
    window.addEventListener("afterprint", after)
    return () => {
      window.removeEventListener("beforeprint", before)
      window.removeEventListener("afterprint", after)
    }
  }, [])

  return { request, print }
}
