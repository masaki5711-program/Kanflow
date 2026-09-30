"use client"

import { useEffect, useRef } from "react"
import { signOut, useSession } from "next-auth/react"
import { usePathname } from "next/navigation"
import { throttle } from "@/lib/throttle"
import { ACTIVITY_EVENT } from "@/hooks/activity"

const TIMEOUT_MS = 2 * 60 * 60 * 1000     // 2 hours
const CHECK_INTERVAL_MS = 30 * 1000       // 30 seconds
const WRITE_THROTTLE_MS = 1000            // suppress localStorage spam
const STORAGE_KEY = "kanflow:lastActiveAt"
const WHITELIST_PREFIXES = ["/login"]

/**
 * Mounted at the top of the client tree (inside SessionProvider). When the
 * user is signed in, watches mouse/keyboard/touch input, scroll, tab focus
 * AND outbound API traffic — any of which counts as "still here". API
 * traffic arrives as the `kanflow:activity` window event, emitted by
 * `apiFetch` (and explicitly via `emitActivity()` by streaming requests that
 * use raw fetch). `window.fetch` is never patched. After
 * TIMEOUT_MS with none of those, redirects to /login?reason=idle.
 *
 * Multi-tab safe: the last-active timestamp is mirrored to localStorage and
 * each tab also listens for `storage` events so activity in one tab keeps
 * every other tab alive.
 */
export default function IdleLogoutWatcher() {
  const { status } = useSession()
  const pathname = usePathname()
  // Seeded inside the effect (render must stay pure).
  const lastActiveRef = useRef<number>(0)

  useEffect(() => {
    if (status !== "authenticated") return
    if (pathname && WHITELIST_PREFIXES.some((p) => pathname.startsWith(p))) return

    function writeNow() {
      const now = Date.now()
      lastActiveRef.current = now
      try {
        window.localStorage.setItem(STORAGE_KEY, String(now))
      } catch {
        // localStorage blocked (e.g. privacy mode) — server-side maxAge still applies.
      }
    }
    const writeActive = throttle(WRITE_THROTTLE_MS, writeNow)

    const inputEvents = [
      "mousemove",
      "mousedown",
      "keydown",
      "touchstart",
      "scroll",
      "visibilitychange",
    ]
    inputEvents.forEach((e) => window.addEventListener(e, writeActive, { passive: true }))

    function onStorage(ev: StorageEvent) {
      if (ev.key !== STORAGE_KEY || !ev.newValue) return
      const n = Number(ev.newValue)
      if (Number.isFinite(n) && n > lastActiveRef.current) lastActiveRef.current = n
    }
    window.addEventListener("storage", onStorage)

    // API traffic counts as activity (the user asked for this explicitly).
    window.addEventListener(ACTIVITY_EVENT, writeActive)

    // Seed initial timestamp so a freshly-mounted watcher doesn't think the
    // user has already been idle for ages.
    writeNow()

    const tick = window.setInterval(() => {
      let last = lastActiveRef.current
      try {
        const stored = Number(window.localStorage.getItem(STORAGE_KEY))
        if (Number.isFinite(stored) && stored > last) last = stored
      } catch {
        // ignore
      }
      if (Date.now() - last >= TIMEOUT_MS) {
        window.clearInterval(tick)
        try {
          window.localStorage.removeItem(STORAGE_KEY)
        } catch {
          // ignore
        }
        signOut({ callbackUrl: "/login?reason=idle", redirect: true })
      }
    }, CHECK_INTERVAL_MS)

    return () => {
      window.clearInterval(tick)
      inputEvents.forEach((e) => window.removeEventListener(e, writeActive))
      window.removeEventListener("storage", onStorage)
      window.removeEventListener(ACTIVITY_EVENT, writeActive)
    }
  }, [status, pathname])

  return null
}
