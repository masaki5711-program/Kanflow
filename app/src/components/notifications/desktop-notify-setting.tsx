"use client"

import { useState, useSyncExternalStore } from "react"
import { Button } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { desktopNotifyState, disableDesktopNotify, enableDesktopNotify, type DesktopNotifyState } from "./desktop-notify"

const noopSubscribe = () => () => {}
const serverState = (): DesktopNotifyState | null => null

/** /me: turn desktop notifications on (asks the browser, from this click) or off. */
export function DesktopNotifySetting() {
  const { t } = useLanguage()
  // Browser-only state: null on the server and during hydration, so the first render matches the server HTML.
  const browser = useSyncExternalStore(noopSubscribe, desktopNotifyState, serverState)
  const [changed, setState] = useState<DesktopNotifyState | null>(null)
  const state = changed ?? browser
  if (!state) return null

  const status = state === "unsupported" ? t.desktopNotifyUnsupported : state === "blocked" ? t.desktopNotifyBlocked : state === "on" ? t.desktopNotifyOn : null
  return (
    <div className="mb-4 rounded-ui-md border border-border p-4" data-testid="desktop-notify-setting">
      <h3 className="text-body font-semibold text-fg">{t.desktopNotifyTitle}</h3>
      <p className="mt-1 text-caption text-fg-muted">{t.desktopNotifyHint}</p>
      {status && (
        <p role="status" className={state === "on" ? "mt-2 text-caption text-fg" : "mt-2 text-caption text-danger"}>
          {status}
        </p>
      )}
      {(state === "off" || state === "on") && (
        <div className="mt-3">
          {state === "off" ? (
            <Button onClick={() => void enableDesktopNotify().then(setState)}>{t.desktopNotifyEnable}</Button>
          ) : (
            <Button variant="secondary" onClick={() => setState(disableDesktopNotify())}>
              {t.desktopNotifyDisable}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
