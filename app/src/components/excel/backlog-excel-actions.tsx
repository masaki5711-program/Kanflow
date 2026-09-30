"use client"

import { useState } from "react"
import { FileUp } from "lucide-react"
import { Button } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { BacklogImportDialog } from "./backlog-import-dialog"
import { ExcelExportButton } from "./excel-export-button"

interface Props {
  projectId: string
  /** backlog.write: shows "Excel 取込". */
  canImport: boolean
  onImported: () => void
}

/** Backlog page toolbar: "Excel 出力" for everyone, "Excel 取込" (+ dialog) for editors. */
export function BacklogExcelActions({ projectId, canImport, onImported }: Props) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  return (
    <>
      <ExcelExportButton href={`/api/projects/${projectId}/backlog/export`} />
      {canImport && (
        <Button variant="secondary" leftIcon={<FileUp className="h-4 w-4" />} onClick={() => setOpen(true)}>
          {t.excelImport}
        </Button>
      )}
      {open && <BacklogImportDialog projectId={projectId} onClose={() => setOpen(false)} onImported={onImported} />}
    </>
  )
}
