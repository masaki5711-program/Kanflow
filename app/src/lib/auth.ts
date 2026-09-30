import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import "@/lib/auth-types"
import type { JWT } from "next-auth/jwt"
import { authLogger } from "@/lib/auth-logger"
import { checkTokenAgainstUser, loadUserAuthState } from "@/lib/authz/session-validity"
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

  return { id: user.id, name: user.name, email: user.email, role: user.role, tokenVersion: user.tokenVersion }
}

/**
 * Re-check a token against the user row (cached, see session-validity.ts):
 * null ends the session (deleted / deactivated / tokenVersion bumped), else
 * the token with the CURRENT DB role. When the DB is unreachable the token
 * is kept as-is (fail open) rather than logging everyone out on a blip; any
 * data access in that request fails anyway.
 */
async function revalidateToken(token: JWT): Promise<JWT | null> {
  const userId = token.id as string
  try {
    const check = checkTokenAgainstUser(token.tokenVersion as number | undefined, await loadUserAuthState(userId))
    if (!check.valid) return null
    return { ...token, role: check.role }
  } catch (error) {
    console.warn(`[auth] session re-validation skipped (user=${userId}): ${error instanceof Error ? error.message : String(error)}`)
    return token.role ? token : { ...token, role: "member" }
  }
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
      const withUser: JWT = user
        ? { ...token, id: user.id, role: user.role, tokenVersion: user.tokenVersion ?? 0 }
        : token
      if (!withUser.id) return withUser
      return revalidateToken(withUser)
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
  // Wrong passwords log one warn line instead of a stack trace (C3-02).
  logger: authLogger,
})
