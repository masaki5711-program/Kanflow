"use client"

import { useState } from "react"
import { useLanguage } from "@/lib/language-context"
import BurndownChart from "@/components/burndown-chart"

interface Props {
  projectId: string
}

export function BurndownPageContent({ projectId }: Props) {
  const { t } = useLanguage()
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex w-8 h-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM5 6a1 1 0 011-1h2a1 1 0 011 1v8a1 1 0 01-1 1H6a1 1 0 01-1-1V6zM11 3a1 1 0 011-1h2a1 1 0 011 1v11a1 1 0 01-1 1h-2a1 1 0 01-1-1V3z"/>
            </svg>
          </span>
          <h1 className="text-lg font-bold text-gray-900">{t.burndownPageTitle}</h1>
        </div>
        <button
          onClick={() => setRefreshKey((k) => k + 1)}
          className="text-sm text-blue-600 hover:text-blue-800 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
        >
          ↻
        </button>
      </div>
      <BurndownChart projectId={projectId} refreshKey={refreshKey} />
    </div>
  )
}
