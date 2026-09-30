/**
 * Shared types for the chat LLM tool registry (MCP-style).
 * Kept in a standalone module so tool packs (chat-tools, analysis-tools)
 * can share them without circular imports.
 */
import type { ProjectActor } from "@/lib/authz/policy"

export interface ToolDefinition {
  type: "function"
  function: {
    name: string
    description: string
    parameters: {
      type: "object"
      properties: Record<string, unknown>
      required?: string[]
    }
  }
}

export interface ToolHandlerArgs {
  projectId: string
  args: Record<string, unknown>
  /**
   * The chat user (from requireProject). Absent for machine callers (the
   * autonomous agent); tools that need it (portfolio_overview) refuse then.
   */
  actor?: ProjectActor
}

export type ToolHandler = (ctx: ToolHandlerArgs) => Promise<string>
