"use client"

/**
 * Modal overlay "close on outside click" was disabled by user request because:
 *   - Text selection drag-outs were closing dialogs mid-copy.
 *   - Stray outside clicks (e.g., while reaching for a button) were closing
 *     long-form dialogs unexpectedly.
 *
 * The hook now intentionally returns no handlers, leaving Escape and the
 * explicit ✕ / Cancel button as the only ways to dismiss a dialog. The hook
 * still exists so all consumers can opt back in later by editing this one
 * file (e.g., switching to a click-with-mousedown-tracking implementation).
 */
export function useOverlayClose(_onClose: () => void) {
  // Touch the parameter so it isn't reported unused at the call sites that
  // pass `onClose` for documentation/consistency.
  void _onClose
  return {}
}
