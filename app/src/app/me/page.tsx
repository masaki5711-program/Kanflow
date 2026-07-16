import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { Header } from "@/components/header"
import { MyProfile } from "./my-profile"

export default async function MyProfilePage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  return (
    <div className="min-h-screen bg-gray-50/50">
      <Header />
      <main className="max-w-3xl mx-auto px-6 py-8">
        <MyProfile />
      </main>
    </div>
  )
}
