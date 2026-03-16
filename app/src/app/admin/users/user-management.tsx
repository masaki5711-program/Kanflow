"use client"

import Link from "next/link"
import { useLanguage } from "@/lib/language-context"
import { UserManagementBase } from "@/components/user-management-base"

export function UserManagement() {
  const { t } = useLanguage()
  return (
    <UserManagementBase
      headerExtra={
        <div className="flex items-center gap-3 mb-1">
          <Link href="/" className="text-sm text-gray-400 hover:text-blue-600 transition-colors">
            {t.projectBackToList}
          </Link>
        </div>
      }
    />
  )
}
