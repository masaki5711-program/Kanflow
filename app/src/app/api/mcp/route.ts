import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { NextResponse } from "next/server"
import { logger } from "@/lib/logger"
import { authenticateApiRequest } from "@/services/api-tokens/api-token-auth"
import { v1ErrorBody } from "@/app/api/v1/_lib/v1-route"
import { createKanflowMcpServer } from "./_lib/server"

/**
 * The Kanflow MCP server (docs/mcp.md): stateless Streamable HTTP, JSON
 * responses. Each POST is authenticated on its own with
 * `Authorization: Bearer kfl_...` (authenticateApiRequest — session cookies
 * are never consulted, so CSRF does not apply; same 401 / 403 / 429 as
 * /api/v1), then served by a fresh server bound to that token. Tools reuse
 * the /api/v1 authorization and write path (app/api/mcp/_lib/tools.ts).
 *
 * GET (server-initiated stream) and DELETE (session end) do not exist in
 * stateless mode: 405.
 */

export const dynamic = "force-dynamic"

const log = logger.child({ module: "mcp" })

/** Upper bound of one JSON-RPC request body. */
export const MCP_MAX_BODY_BYTES = 1024 * 1024

function errorResponse(status: number, body: object, headers: Record<string, string> = {}): NextResponse {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } })
}

export async function POST(request: Request): Promise<Response> {
  let auth: Awaited<ReturnType<typeof authenticateApiRequest>>
  try {
    auth = await authenticateApiRequest(request)
  } catch (error) {
    // DB unreachable during the token lookup: fail closed.
    const { status, body } = v1ErrorBody(error, { surface: "mcp" })
    return errorResponse(status, body)
  }
  if (!auth.ok) return errorResponse(auth.status, { error: auth.error, code: auth.code }, auth.headers)

  const server = createKanflowMcpServer(auth.principal)
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    maxRequestBodySize: MCP_MAX_BODY_BYTES,
  })
  // Malformed JSON-RPC from a client is answered by the transport (400); keep a trace without the payload.
  transport.onerror = (error) => log.info("mcp transport rejected a message", { patPrefix: auth.principal.tokenPrefix, error: error.message })
  try {
    await server.connect(transport)
    const response = await transport.handleRequest(request)
    const headers = new Headers(response.headers)
    headers.set("Cache-Control", "no-store")
    headers.set("X-RateLimit-Limit", String(auth.rate.limit))
    headers.set("X-RateLimit-Remaining", String(auth.rate.remaining))
    return new Response(response.body, { status: response.status, headers })
  } catch (error) {
    const { status, body } = v1ErrorBody(error, { surface: "mcp", patPrefix: auth.principal.tokenPrefix })
    return errorResponse(status, body)
  } finally {
    await server.close().catch((error: unknown) => log.warn("mcp server close failed", { error: error instanceof Error ? error.message : String(error) }))
  }
}

function methodNotAllowed(): NextResponse {
  return errorResponse(405, { error: "Method not allowed (stateless MCP endpoint: use POST)", code: "METHOD_NOT_ALLOWED" }, { Allow: "POST" })
}

export async function GET(): Promise<Response> {
  return methodNotAllowed()
}

export async function DELETE(): Promise<Response> {
  return methodNotAllowed()
}
