"use client"

import { useEffect } from "react"
import { TOKEN_HEX } from "@/lib/design-tokens"

/**
 * When printing, force every <details> in the report open so collapsed
 * history still appears on paper; restore the user's state afterwards.
 */
export function usePrintExpandDetails(containerSelector: string) {
  useEffect(() => {
    function setAllDetailsOpen(open: boolean) {
      document.querySelectorAll<HTMLDetailsElement>(`${containerSelector} details`).forEach((el) => {
        if (open) {
          el.dataset.userOpen = el.open ? "1" : "0"
          el.open = true
        } else if (el.dataset.userOpen === "0") {
          el.open = false
        }
      })
    }
    const onBefore = () => setAllDetailsOpen(true)
    const onAfter = () => setAllDetailsOpen(false)
    window.addEventListener("beforeprint", onBefore)
    window.addEventListener("afterprint", onAfter)
    return () => {
      window.removeEventListener("beforeprint", onBefore)
      window.removeEventListener("afterprint", onAfter)
    }
  }, [containerSelector])
}

/** Screen + A4 print styles for the project report. */
export function ReportPrintStyles() {
  return (
    <style jsx global>{`
      @media print {
        header, aside, .print-hide {
          display: none !important;
        }
        body {
          margin: 0;
          padding: 0;
          background: white !important;
        }
        .flex {
          display: block !important;
        }
        main, .report-container {
          max-width: 100% !important;
          width: 100% !important;
          margin: 0 !important;
          padding: 10mm !important;
        }
        .report-section {
          page-break-inside: avoid;
          break-inside: avoid;
        }
        svg {
          max-width: 100%;
        }
        @page {
          size: A4;
          margin: 15mm;
        }
        * {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
      }
      .report-section {
        margin-bottom: 1.5rem;
        padding-bottom: 1.5rem;
        border-bottom: 1px solid ${TOKEN_HEX.border};
      }
      .report-section:last-of-type {
        border-bottom: none;
      }
      .report-heading {
        font-size: 1rem;
        font-weight: 700;
        color: ${TOKEN_HEX.fg};
        margin-bottom: 0.75rem;
        padding-bottom: 0.5rem;
        border-bottom: 2px solid ${TOKEN_HEX.primary};
      }
    `}</style>
  )
}
