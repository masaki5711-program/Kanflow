import { useCallback, useInsertionEffect, useMemo, useRef } from "react"

/**
 * Returns a function with a stable identity that always calls the latest
 * `fn`. Use it for event handlers passed to `React.memo` list rows so a parent
 * re-render does not invalidate every row. Do not call the result during
 * render (it would see the previous render's `fn`).
 */
export function useStableCallback<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn)
  useInsertionEffect(() => {
    ref.current = fn
  })
  return useCallback((...args: A) => ref.current(...args), [])
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- handler maps are heterogeneous
type AnyHandler = (...args: any[]) => unknown
/** Any object whose values are all functions (works with interfaces, too). */
type HandlerMap<T> = { [K in keyof T]: AnyHandler }

/**
 * `useStableCallback` for a whole object of handlers (e.g. the `actions` prop
 * of a list). The returned object — and every function in it — keeps its
 * identity while the set of keys is unchanged, and always calls the latest
 * handler. Event-handler use only (never call during render).
 */
export function useStableHandlers<T extends HandlerMap<T>>(handlers: T): T {
  const ref = useRef(handlers)
  useInsertionEffect(() => {
    ref.current = handlers
  })
  const keys = Object.keys(handlers).sort().join("\u0000")
  return useMemo(() => {
    const entries = keys
      .split("\u0000")
      .filter(Boolean)
      .map((key) => [key, (...args: unknown[]) => (ref.current[key as keyof T] as AnyHandler)(...args)] as const)
    return Object.fromEntries(entries) as T
  }, [keys])
}
