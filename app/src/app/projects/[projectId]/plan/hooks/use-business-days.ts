"use client"

import { useCallback, useSyncExternalStore } from "react"

const STORAGE_KEY = "kanflow.plan.businessDays"
const listeners = new Set<() => void>()
/** Fallback when storage is unavailable (private window, blocked site data). */
let memory = false

function read(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1"
  } catch {
    return memory
  }
}

function write(on: boolean): void {
  memory = on
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? "1" : "0")
  } catch {
    // Storage is a convenience only: the in-memory value keeps this tab consistent.
  }
  for (const l of listeners) l()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  window.addEventListener("storage", listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener("storage", listener)
  }
}

/**
 * "Count business days" preference of the plan (duration input, inline edits).
 * Shared between every component on the page and remembered per browser.
 */
export function useBusinessDays(): readonly [boolean, (on: boolean) => void] {
  const value = useSyncExternalStore(subscribe, read, () => false)
  const set = useCallback((on: boolean) => write(on), [])
  return [value, set] as const
}
