const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789"

/**
 * A new element id: 20 random characters. `crypto.getRandomValues` is used when the browser has it (it is
 * available on plain-HTTP intranet origins, unlike `crypto.randomUUID`); the fallback is only for
 * environments without Web Crypto. The id is an identifier, not a secret.
 */
export function newElementId(): string {
  const bytes = new Uint8Array(20)
  const webCrypto = (globalThis as { crypto?: { getRandomValues?: (array: Uint8Array) => Uint8Array } }).crypto
  if (webCrypto?.getRandomValues) webCrypto.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  let id = ""
  for (const byte of bytes) id += ALPHABET[byte % ALPHABET.length]
  return id
}
