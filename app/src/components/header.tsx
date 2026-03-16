"use client"

import { useSession, signOut } from "next-auth/react"
import Link from "next/link"
import Image from "next/image"
import { useLanguage } from "@/lib/language-context"

interface HeaderProps {
  projectName?: string
  projectId?: string
}

export function Header({ projectName, projectId }: HeaderProps = {}) {
  const { data: session } = useSession()
  const { t } = useLanguage()

  const initials = session?.user?.name
    ? session.user.name.slice(0, 2).toUpperCase()
    : "?"

  return (
    <header className="bg-white border-b border-gray-200/80 px-6 py-2.5 flex items-center justify-between sticky top-0 z-40 backdrop-blur-sm bg-white/95">
      <div className="flex items-center gap-2">
        <Link href="/" className="flex items-center gap-2.5 group">
          <Image src="/logo.svg" alt="Kanflow" width={32} height={32} className="shadow-sm group-hover:shadow-md transition-shadow rounded-lg" />
          <span className="text-lg font-semibold text-gray-800 tracking-tight group-hover:text-blue-600 transition-colors">
            {t.appTitle}
          </span>
        </Link>
        {projectName && projectId && (
          <>
            <svg className="w-4 h-4 text-gray-300 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd"/>
            </svg>
            <Link
              href={`/projects/${projectId}`}
              className="text-sm font-medium text-gray-500 hover:text-blue-600 transition-colors truncate max-w-[200px]"
              title={projectName}
            >
              {projectName}
            </Link>
          </>
        )}
      </div>
      {session?.user && (
        <div className="flex items-center gap-3">
          <Link
            href="/settings/categories"
            className="text-sm text-gray-500 hover:text-blue-600 transition-colors px-3 py-1.5 rounded-lg hover:bg-blue-50 font-medium"
          >
            {t.categorySettingsTitle}
          </Link>
          <div className="w-px h-5 bg-gray-200" />
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center text-xs font-semibold text-slate-600 ring-2 ring-white shadow-sm">
              {initials}
            </div>
            <span className="text-sm font-medium text-gray-700 hidden sm:block">
              {session.user.name}
            </span>
          </div>
          <div className="w-px h-5 bg-gray-200" />
          <button
            onClick={() => signOut()}
            className="text-sm text-gray-400 hover:text-red-500 transition-colors px-2 py-1 rounded-md hover:bg-red-50"
          >
            {t.logout}
          </button>
        </div>
      )}
    </header>
  )
}
