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

  const isAdmin = session?.user?.role === "admin"

  return (
    <header className="bg-white/80 backdrop-blur-md border-b border-gray-200/60 shadow-sm shadow-gray-200/40 px-6 py-2.5 flex items-center justify-between sticky top-0 z-40">
      <div className="flex items-center gap-2">
        <Link href="/" className="flex items-center gap-2.5 group">
          <Image src="/logo.svg" alt="Kanflow" width={32} height={32} className="shadow-sm group-hover:shadow-md transition-shadow duration-200 rounded-lg" />
          <span className="text-lg font-semibold text-gray-800 tracking-tight group-hover:text-blue-600 transition-colors duration-200">
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
              className="text-sm font-medium text-gray-500 hover:text-blue-600 transition-colors duration-200 truncate max-w-[200px]"
              title={projectName}
            >
              {projectName}
            </Link>
          </>
        )}
      </div>
      {session?.user && (
        <div className="flex items-center gap-1">
          {/* Project list - always visible */}
          <Link
            href="/"
            className="text-sm text-gray-500 hover:text-blue-600 transition-all duration-200 px-3 py-1.5 rounded-full hover:bg-blue-50/80 font-medium flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/>
            </svg>
            {t.projectListTitle}
          </Link>

          {/* My profile - always visible */}
          <Link
            href="/me"
            className="text-sm text-gray-500 hover:text-blue-600 transition-all duration-200 px-3 py-1.5 rounded-full hover:bg-blue-50/80 font-medium flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd"/>
            </svg>
            {t.myProfileMenu}
          </Link>

          {/* User management - admin only */}
          {isAdmin && (
            <Link
              href="/admin/users"
              className="text-sm text-gray-500 hover:text-blue-600 transition-all duration-200 px-3 py-1.5 rounded-full hover:bg-blue-50/80 font-medium flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/>
              </svg>
              {t.userManagementTitle}
            </Link>
          )}

          {/* Section management - admin only */}
          {isAdmin && (
            <Link
              href="/admin/sections"
              className="text-sm text-gray-500 hover:text-blue-600 transition-all duration-200 px-3 py-1.5 rounded-full hover:bg-blue-50/80 font-medium flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd"/>
              </svg>
              {t.sectionAdminTitle}
            </Link>
          )}

          {/* Admin category management */}
          {isAdmin && (
            <Link
              href="/admin/categories"
              className="text-sm text-gray-500 hover:text-blue-600 transition-all duration-200 px-3 py-1.5 rounded-full hover:bg-blue-50/80 font-medium flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h5c.256 0 .512.098.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd"/>
              </svg>
              カテゴリ管理
            </Link>
          )}

          <div className="w-px h-5 bg-gray-200/80 mx-1.5" />

          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center text-xs font-semibold text-blue-700 ring-2 ring-white shadow-sm">
              {initials}
            </div>
            <span className="text-sm font-medium text-gray-700 hidden sm:block">
              {session.user.name}
            </span>
          </div>
          <div className="w-px h-5 bg-gray-200/80 mx-1.5" />
          <button
            onClick={() => signOut()}
            className="text-sm text-gray-400 hover:text-red-500 transition-all duration-200 px-2.5 py-1.5 rounded-full hover:bg-red-50/80"
          >
            {t.logout}
          </button>
        </div>
      )}
    </header>
  )
}
