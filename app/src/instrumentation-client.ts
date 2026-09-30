/**
 * Runs in the browser before the app hydrates (Next.js `instrumentation-client`).
 *
 * The popstate gate must be registered before the App Router's own popstate
 * listener, so unsaved-changes guards can keep the user on a dirty editor
 * when the browser Back button is pressed (see hooks/popstate-gate.ts, F-02).
 */
import { installPopstateGate } from "@/hooks/popstate-gate"

installPopstateGate()
