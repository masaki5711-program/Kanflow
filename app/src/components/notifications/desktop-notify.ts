/**
 * Desktop notifications (browser Notification API, no push service): shown
 * while a Kanflow tab is open but in the background. The on/off choice is a
 * per-browser convenience kept in localStorage.
 */
const STORAGE_KEY = "kanflow:desktop-notify"
/** Remembered ids; older ones are forgotten so the set stays small. */
const SEEN_MAX = 200

export type DesktopNotifyState = "unsupported" | "blocked" | "off" | "on"

export function desktopNotifySupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window
}

function storedOn(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1"
  } catch {
    return false
  }
}

function store(on: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? "1" : "0")
  } catch {
    // Private window / blocked storage: the choice just does not persist.
  }
}

/** Current state: on = the user turned it on AND the browser allows it. */
export function desktopNotifyState(): DesktopNotifyState {
  if (!desktopNotifySupported()) return "unsupported"
  if (Notification.permission === "denied") return "blocked"
  return Notification.permission === "granted" && storedOn() ? "on" : "off"
}

/** Ask the browser (must run from a click) and remember the choice. */
export async function enableDesktopNotify(): Promise<DesktopNotifyState> {
  if (!desktopNotifySupported()) return "unsupported"
  const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission
  store(permission === "granted")
  return desktopNotifyState()
}

export function disableDesktopNotify(): DesktopNotifyState {
  store(false)
  return desktopNotifyState()
}

/** Only worth a popup when the person is not looking at Kanflow. */
export function isInBackground(): boolean {
  return document.visibilityState === "hidden" || !document.hasFocus()
}

export interface DesktopMessage {
  title: string
  body: string
  /** Same tag replaces an earlier popup instead of stacking. */
  tag: string
  /** Called when the popup is clicked (the window is focused first). */
  onOpen: () => void
}

export function showDesktopNotification(message: DesktopMessage): void {
  if (desktopNotifyState() !== "on") return
  try {
    const popup = new Notification(message.title, { body: message.body, tag: message.tag })
    popup.onclick = () => {
      window.focus()
      message.onOpen()
      popup.close()
    }
  } catch {
    // Some platforms only allow notifications through a service worker; stay silent.
  }
}

/** Remembers ids already announced (pure bookkeeping, newest kept). */
export function createSeenSet(): { has: (id: string) => boolean; add: (id: string) => void } {
  const ids: string[] = []
  return {
    has: (id) => ids.includes(id),
    add: (id) => {
      if (ids.includes(id)) return
      ids.push(id)
      if (ids.length > SEEN_MAX) ids.shift()
    },
  }
}
