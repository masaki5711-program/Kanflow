/**
 * Pure state machine behind `useApiQuery`.
 *
 * Every fetch is identified by a request key (`url#reloadToken`). The hook
 * derives `isLoading` as "the settled key differs from the key we want",
 * so starting a request never needs a synchronous setState inside an effect,
 * and results for any key other than the current one are dropped.
 */

export interface QueryState<T> {
  /** URL whose data is held in `data` (null = nothing loaded yet). */
  url: string | null
  /** Request key of the last settled request (success or error). */
  settledKey: string | null
  data: T | undefined
  hasData: boolean
  error: Error | null
  /** Bumped by refetch() to force a new request for the same URL. */
  reloadToken: number
}

export type QueryAction<T> =
  | { type: "success"; key: string; url: string; data: T }
  | { type: "error"; key: string; url: string; error: Error }
  | { type: "reload" }
  | { type: "mutate"; url: string; fallback: T | undefined; updater: T | undefined | ((prev: T | undefined) => T | undefined) }

export function initialQueryState<T>(): QueryState<T> {
  return { url: null, settledKey: null, data: undefined, hasData: false, error: null, reloadToken: 0 }
}

export function requestKey(url: string | null, reloadToken: number): string | null {
  return url === null ? null : `${url}#${reloadToken}`
}

/** Whether a response for `resultKey` may still be applied while `currentKey` is wanted. */
export function isCurrentRequest(resultKey: string, currentKey: string | null): boolean {
  return resultKey === currentKey
}

export function queryReducer<T>(state: QueryState<T>, action: QueryAction<T>): QueryState<T> {
  switch (action.type) {
    case "success":
      return { ...state, url: action.url, settledKey: action.key, data: action.data, hasData: true, error: null }
    case "error":
      // Keep previously loaded data for the same URL (stale-while-error).
      return {
        ...state,
        settledKey: action.key,
        error: action.error,
        ...(state.url === action.url ? {} : { url: action.url, data: undefined, hasData: false }),
      }
    case "reload":
      return { ...state, reloadToken: state.reloadToken + 1 }
    case "mutate": {
      const base = state.url === action.url && state.hasData ? state.data : action.fallback
      const next =
        typeof action.updater === "function"
          ? (action.updater as (prev: T | undefined) => T | undefined)(base)
          : action.updater
      return { ...state, url: action.url, data: next, hasData: true }
    }
  }
}

export interface QueryView<T> {
  data: T | undefined
  error: Error | null
  /** A request for the current URL is in flight and there is no data to show yet. */
  isLoading: boolean
  /** A request for the current URL is in flight (initial load or refetch). */
  isFetching: boolean
}

/** Derive what the hook exposes for the currently requested URL. */
export function selectQueryView<T>(
  state: QueryState<T>,
  url: string | null,
  initialData: T | undefined,
): QueryView<T> {
  const key = requestKey(url, state.reloadToken)
  const sameUrl = url !== null && state.url === url
  const data = sameUrl && state.hasData ? state.data : initialData
  const isFetching = key !== null && state.settledKey !== key
  return {
    data,
    error: key !== null && state.settledKey === key ? state.error : null,
    isLoading: isFetching && data === undefined,
    isFetching,
  }
}
