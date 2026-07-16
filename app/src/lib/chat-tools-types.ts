/**
 * Shared types for the chat LLM tool registry (MCP-style).
 * Kept in a standalone module so tool packs (chat-tools, analysis-tools)
 * can share them without circular imports.
 */

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
}

export type ToolHandler = (ctx: ToolHandlerArgs) => Promise<string>
