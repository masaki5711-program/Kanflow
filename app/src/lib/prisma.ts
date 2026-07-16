import { PrismaMariaDb } from "@prisma/adapter-mariadb"
import { PrismaClient } from "@/generated/prisma/client"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function getRequiredEnv(key: string, defaultForDev?: string): string {
  const value = process.env[key]
  if (value) return value
  if (process.env.NODE_ENV !== "production" && defaultForDev) return defaultForDev
  throw new Error(`Required environment variable ${key} is not set`)
}

function createPrismaClient() {
  const adapter = new PrismaMariaDb({
    host: getRequiredEnv("DATABASE_HOST", "localhost"),
    port: Number(getRequiredEnv("DATABASE_PORT", "3306")),
    user: getRequiredEnv("DATABASE_USER", "root"),
    password: getRequiredEnv("DATABASE_PASSWORD"),
    database: getRequiredEnv("DATABASE_NAME", "scrum_tool"),
    connectionLimit: 5,
    // MySQL 8.4 uses caching_sha2_password. Over a non-TLS loopback
    // connection the mariadb driver must fetch the server's RSA public key
    // to encrypt the password; without this it fails with
    // ER_CANNOT_RETRIEVE_RSA_KEY and the pool times out. Safe here because
    // the connection is local (127.0.0.1).
    allowPublicKeyRetrieval: true,
  })
  return new PrismaClient({ adapter })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
