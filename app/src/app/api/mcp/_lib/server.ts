import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { ApiPrincipal } from "@/services/api-tokens/api-token-auth"
import { DATA_NOTICE } from "./tool-kit"
import { registerKanflowTools } from "./tools"

export const MCP_SERVER_NAME = "kanflow"
export const MCP_SERVER_VERSION = "1.0.0"

const INSTRUCTIONS = [
  "Kanflow is the team's agile project-management tool (product backlog, sprints, tasks, comments, Icebox, daily scrum).",
  "Every call acts as the token's owner with the same permissions as in the Kanflow UI, limited by the token's scopes; a refusal with code INSUFFICIENT_SCOPE names the scope the user must add to the token (requiredScope).",
  "Find the project with resolve_project (git remote URL) or list_projects. PBIs can be referred to as PBI-12 together with projectId.",
  DATA_NOTICE,
].join("\n")

/** A fresh server per request (stateless Streamable HTTP), bound to the authenticated token. */
export function createKanflowMcpServer(principal: ApiPrincipal): McpServer {
  const server = new McpServer({ name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION }, { instructions: INSTRUCTIONS })
  registerKanflowTools(server, principal)
  return server
}
