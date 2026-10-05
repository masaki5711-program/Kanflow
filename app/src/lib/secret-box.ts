import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

/**
 * Seals small secrets (integration access tokens) at rest with AES-256-GCM.
 * Key: INTEGRATION_SECRET_KEY when set (any string, hashed to 32 bytes),
 * otherwise derived from AUTH_SECRET / NEXTAUTH_SECRET — so a stolen DB dump
 * alone does not reveal the token. Rotating that secret makes stored tokens
 * unreadable (the settings page then asks for the token again).
 *
 * Format: "v1:<iv b64>:<tag b64>:<ciphertext b64>".
 */
const VERSION = "v1"

function key(env: NodeJS.ProcessEnv = process.env): Buffer {
  const source = env.INTEGRATION_SECRET_KEY?.trim() || env.AUTH_SECRET?.trim() || env.NEXTAUTH_SECRET?.trim()
  if (!source) throw new Error("INTEGRATION_SECRET_KEY / AUTH_SECRET is not set")
  return createHash("sha256").update(`kanflow-secret-box:${source}`).digest()
}

export function seal(plain: string, env?: NodeJS.ProcessEnv): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key(env), iv)
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  return [VERSION, iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":")
}

/** The plain secret, or null when it cannot be opened (other key, tampered, malformed). */
export function open(sealed: string, env?: NodeJS.ProcessEnv): string | null {
  const [version, iv, tag, data] = sealed.split(":")
  if (version !== VERSION || !iv || !tag || !data) return null
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(env), Buffer.from(iv, "base64"))
    decipher.setAuthTag(Buffer.from(tag, "base64"))
    return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8")
  } catch {
    return null
  }
}

/** "abcd" of "glpat-…abcd" — enough to tell tokens apart, useless to an attacker. */
export function secretHint(plain: string): string {
  return plain.trim().slice(-4)
}
