import diagnosticsChannel from "node:diagnostics_channel"
import { routeTemplate } from "./route-template"
import { metricsStore, type MetricsStore } from "./store"

/**
 * Central request timing without touching any route handler: Node's HTTP
 * server publishes `http.server.request.start` / `http.server.response.finish`
 * on diagnostics_channel for every request `next start` serves. We time /api
 * requests between the two and feed the metrics store per route template.
 *
 * (proxy.ts cannot do this: it runs before the handler and never sees the
 * status or the end of the response, and it skips /api on purpose.)
 */

export const REQUEST_START = "http.server.request.start"
export const RESPONSE_FINISH = "http.server.response.finish"

interface IncomingLike {
  url?: string
  method?: string
}
interface OutgoingLike {
  statusCode: number
  getHeader(name: string): unknown
}
interface ChannelMessage {
  request: IncomingLike
  response: OutgoingLike
}

function isStream(response: OutgoingLike): boolean {
  const type = response.getHeader("content-type")
  return typeof type === "string" && type.includes("text/event-stream")
}

/**
 * Subscribe the store to the HTTP server channels. Returns an uninstall
 * function. Uses a monotonic clock (performance.now) for durations.
 */
export function installHttpMetrics(store: MetricsStore = metricsStore(), clock: () => number = () => performance.now()): () => void {
  const started = new WeakMap<object, { t0: number; route: string; method: string }>()

  const onStart = (message: unknown) => {
    const { request, response } = message as ChannelMessage
    const route = routeTemplate(request.url ?? "")
    if (!route) return
    started.set(response, { t0: clock(), route, method: (request.method ?? "GET").toUpperCase() })
  }

  const onFinish = (message: unknown) => {
    const { response } = message as ChannelMessage
    const entry = started.get(response)
    if (!entry) return
    started.delete(response)
    store.recordRequest({
      route: entry.route,
      method: entry.method,
      status: response.statusCode,
      durationMs: Math.round(clock() - entry.t0),
      streamed: isStream(response),
    })
  }

  diagnosticsChannel.subscribe(REQUEST_START, onStart)
  diagnosticsChannel.subscribe(RESPONSE_FINISH, onFinish)
  return () => {
    diagnosticsChannel.unsubscribe(REQUEST_START, onStart)
    diagnosticsChannel.unsubscribe(RESPONSE_FINISH, onFinish)
  }
}
