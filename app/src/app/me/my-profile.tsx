"use client"

import { UserRound } from "lucide-react"
import { useLanguage } from "@/lib/language-context"
import { useApiQuery } from "@/hooks"
import { SkeletonCard, PageHeader } from "@/components/ui"
import { ProfileForm, type ProfileData } from "./profile-form"
import { PasswordForm } from "./password-form"
import { useDocumentTitle } from "@/hooks/use-document-title"

export function MyProfile() {
  const { t } = useLanguage()
  useDocumentTitle([t.myProfileTitle])
  const { data: profile, isLoading, mutate } = useApiQuery<ProfileData>("/api/user/profile", { toastOnError: true })

  if (isLoading || !profile) {
    return (
      <div className="space-y-4">
        <PageHeader title={t.myProfileTitle} className="mb-2" />
        <SkeletonCard label={t.loading} />
        <SkeletonCard />
      </div>
    )
  }

  const roleLabel =
    profile.role === "admin" ? t.userRoleAdmin : profile.role === "section_manager" ? t.roleSectionManager : t.userRoleMember

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.myProfileTitle}
        className="mb-2"
        icon={
          <span className="block p-2 bg-primary rounded-ui-md text-primary-fg shadow-ui-sm">
            <UserRound className="w-6 h-6" />
          </span>
        }
      />

      {/* Read-only basic info */}
      <section aria-labelledby="profile-basic" className="bg-surface rounded-ui-lg border border-border shadow-ui-sm p-6">
        <h2 id="profile-basic" className="text-body font-semibold text-fg-muted uppercase tracking-wider mb-4">
          {t.myProfileBasicInfo}
        </h2>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <dt className="text-caption text-fg-muted mb-1">{t.userEmail}</dt>
            <dd className="text-body font-medium text-fg break-all">{profile.email}</dd>
            <dd className="text-caption text-fg-subtle mt-1">{t.myProfileEmailChangeHint}</dd>
          </div>
          <div>
            <dt className="text-caption text-fg-muted mb-1">{t.userRole}</dt>
            <dd className="text-body font-medium text-fg">{roleLabel}</dd>
          </div>
        </dl>
      </section>

      <ProfileForm key={profile.id} profile={profile} onSaved={(p) => mutate(p)} />
      <PasswordForm />
    </div>
  )
}
