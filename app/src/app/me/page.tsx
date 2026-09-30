import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { Header } from "@/components/header"
import { MyProfile } from "./my-profile"
import { NotificationSettings } from "@/components/notifications/notification-settings"
import { buildPageMetadata } from "@/app/page-metadata"

export function generateMetadata() {
  return buildPageMetadata(({ t }) => t.myProfileTitle)
}

export default async function MyProfilePage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  return (
    <div className="min-h-screen bg-surface-muted">
      <Header />
      <main id="main-content" className="page-narrow">
        <MyProfile />
        <div className="mt-6">
          <NotificationSettings />
        </div>
      </main>
    </div>
  )
}
