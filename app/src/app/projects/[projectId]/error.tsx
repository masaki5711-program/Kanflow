"use client"

import { getTranslations } from "@/lib/i18n"

const t = getTranslations("ja")

export default function ProjectError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="text-center max-w-md mx-auto px-6">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-red-100 mb-4">
          <svg className="w-7 h-7 text-red-500" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
          </svg>
        </div>
        <h2 className="text-lg font-bold text-gray-900 mb-2">
          {t.errorPageTitle}
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          {error.message || t.errorPageMessage}
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 text-sm font-medium shadow-sm"
          >
            {t.errorRetry}
          </button>
          <a
            href="/"
            className="px-5 py-2.5 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 text-sm font-medium"
          >
            {t.errorGoHome}
          </a>
        </div>
      </div>
    </div>
  )
}
