import "next-auth"

declare module "next-auth" {
  interface User {
    role?: string
    /** User.tokenVersion at login; copied into the JWT (see authz/session-validity.ts). */
    tokenVersion?: number
  }
  interface Session {
    user: {
      id: string
      name: string
      email: string
      role: string
    }
  }

  interface JWT {
    id?: string
    role?: string
    tokenVersion?: number
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string
    role?: string
    /** Absent on tokens issued before tokenVersion existed (treated as 0). */
    tokenVersion?: number
  }
}
