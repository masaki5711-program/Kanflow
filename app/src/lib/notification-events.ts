/**
 * Window event fired after the viewer read notifications somewhere (comment
 * thread, team chat, top page, dashboard panel): the bell count and the
 * unread badges reload at once instead of waiting for their next poll.
 */
export const NOTIFICATIONS_CHANGED_EVENT = "kanflow:notifications-changed"

export function announceNotificationsChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT))
}
