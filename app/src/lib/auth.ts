import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import "@/lib/auth-types"
import {
  clientIpFromHeaders,
  getLoginLimiters,
  isLoginBlocked,
  recordLoginFailure,
  recordLoginSuccess,
} from "@/lib/rate-limit"

async function verifyCredentials(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user || !user.isActive) return null

  const isValid = await bcrypt.compare(password, user.password)
  if (!isValid) return null

  return { id: user.id, name: user.name, email: user.email, role: user.role }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // 2-hour idle timeout (security): server side absolute upper bound for the
  // JWT cookie. Rolling refresh every 10 min on user navigation so an
  // actively used session stays alive without the user re-authenticating.
  session: {
    strategy: "jwt",
    maxAge: 2 * 60 * 60,
    updateAge: 10 * 60,
  },
  jwt: {
    maxAge: 2 * 60 * 60,
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const email = credentials?.email as string | undefined
        const password = credentials?.password as string | undefined
        if (!email || !password) return null

        const limiters = getLoginLimiters()
        const ip = clientIpFromHeaders(request?.headers)
        if (isLoginBlocked(limiters, email, ip)) {
          console.warn(`[auth] login rate limit exceeded (user=${email}, ip=${ip ?? "unknown"})`)
          return null
        }

        const user = await verifyCredentials(email, password)
        if (!user) {
          recordLoginFailure(limiters, email, ip)
          return null
        }

        recordLoginSuccess(limiters, email)
        return user
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
      }
      // Refresh role from DB if missing (e.g., token created before role was added)
      if (token.id && !token.role) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { role: true },
          })
          token.role = dbUser?.role ?? "member"
        } catch {
          // DB error - use default
          token.role = "member"
        }
      }
      return token
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string
        session.user.role = (token.role as string) ?? "member"
      }
      return session
    },
  },
  pages: {
    signIn: "/login",
  },
})
