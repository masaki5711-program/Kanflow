import { prisma } from "@/lib/prisma"
import { extractAttachment } from "@/lib/attachment-extractor"
import { ANALYSIS_TOOL_DEFS, analysisHandlers } from "@/lib/analysis-tools"
import { DETAIL_TOOL_DEFS, detailHandlers } from "@/lib/analysis-tools-detail"
import { packHandlers } from "@/lib/chat-tool-packs"
import { repoKnowledgeHandlers } from "@/lib/repo-knowledge-tools"
import type { ToolDefinition, ToolHandler, ToolHandlerArgs } from "@/lib/chat-tools-types"

/**
 * Tool registry exposed to the chat LLM for Kanflow project context (MCP-style).
 * Each entry has a JSON Schema for the model + a handler that runs server-side
 * and returns a string the model can read as the tool response.
 *
 * Two packs are registered:
 * - file tools (below): attachment listing + content extraction
 * - analysis tools (analysis-tools.ts): deterministic DB aggregations whose
 *   numbers the model must quote verbatim (anti-hallucination)
 *
 * Keep the surface small and orthogonal — every extra tool widens the model's
 * decision space and slows the chat down with extra reasoning loops.
 */

export type { ToolDefinition, ToolHandler, ToolHandlerArgs } from "@/lib/chat-tools-types"

const tools: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "list_attachments",
      description:
        "List the project's attached files. Returns each file's id, original name, size, and mime type. Use this first to find the id of a file the user mentions by name.",
      parameters: {
        type: "object",
        properties: {
          name_contains: {
            type: "string",
            description: "Optional substring to filter file names (case-insensitive). Use this when the user mentions a file by name.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "extract_attachment_content",
      description:
        "Read the text content of a specific attached file by id. Supports PDF, Word (.docx), Excel (.xlsx), PowerPoint (.pptx), and plain text formats. Use this when the user asks to summarize, quote, or answer questions about a file. Large files are truncated to about 60k characters.",
      parameters: {
        type: "object",
        properties: {
          attachment_id: {
            type: "string",
            description: "The id returned by list_attachments, or the attachment_id of a PBI reference file from get_work_item_details.",
          },
        },
        required: ["attachment_id"],
      },
    },
  },
]

export const CHAT_TOOLS: ToolDefinition[] = [...tools, ...ANALYSIS_TOOL_DEFS, ...DETAIL_TOOL_DEFS]

const handlers: Record<string, ToolHandler> = {
  async list_attachments({ projectId, args }) {
    const nameContains =
      typeof args.name_contains === "string" && args.name_contains.trim()
        ? args.name_contains.trim()
        : undefined
    const where: Record<string, unknown> = { projectId }
    if (nameContains) {
      where.originalName = { contains: nameContains }
    }
    const rows = await prisma.projectAttachment.findMany({
      where,
      select: {
        id: true,
        originalName: true,
        fileSize: true,
        mimeType: true,
        createdAt: true,
        linkUrl: true,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    })
    if (rows.length === 0) return "No attachments found."
    return rows
      .map((r) => {
        const kb = Math.round(r.fileSize / 1024)
        const created = r.createdAt.toISOString().slice(0, 10)
        if (r.linkUrl) return `- id=${r.id} | ${r.originalName} | link ${r.linkUrl} | added ${created}`
        return `- id=${r.id} | ${r.originalName} | ${r.mimeType} | ${kb} KB | uploaded ${created}`
      })
      .join("\n")
  },

  async extract_attachment_content({ projectId, args }) {
    const id = typeof args.attachment_id === "string" ? args.attachment_id : ""
    if (!id) return "Error: attachment_id is required."
    // Project files first, then a PBI's 参考資料 files (same storage, scoped through the PBI).
    const row =
      (await prisma.projectAttachment.findFirst({
        where: { id, projectId },
        select: { fileName: true, originalName: true, mimeType: true, linkUrl: true },
      })) ??
      (await prisma.pbiAttachment
        .findFirst({ where: { id, backlogItem: { projectId } }, select: { fileName: true, originalName: true, mimeType: true } })
        .then((r) => (r ? { ...r, linkUrl: null } : null)))
    if (!row) return `Error: attachment ${id} not found in this project.`
    if (row.linkUrl) return `${row.originalName} is a link (no file content): ${row.linkUrl}`
    const result = await extractAttachment({
      projectId,
      fileName: row.fileName,
      mimeType: row.mimeType,
      originalName: row.originalName,
    })
    if (!result.ok) return `Error: ${result.error}`
    const header = `Content of ${row.originalName} (${result.format}${result.truncated ? ", truncated" : ""}):`
    return `${header}\n\n${result.text}`
  },
}

/**
 * Dispatch a tool call. Covers the core pack above plus the optional P3 packs
 * (chat-tool-packs.ts: planning / history / portfolio / proposals), which the
 * chat route offers per request via selectPacks(), and the repository
 * knowledge tools (repo-knowledge-tools.ts, offered when the project has one). CHAT_TOOLS itself stays
 * the core set — the autonomous agent (ai-agent.ts) uses it and must never
 * see proposal tools (no human to approve).
 */
export async function runTool(name: string, ctx: ToolHandlerArgs): Promise<string> {
  const handler = handlers[name] ?? analysisHandlers[name] ?? detailHandlers[name] ?? packHandlers[name] ?? repoKnowledgeHandlers[name]
  if (!handler) return `Error: unknown tool ${name}`
  try {
    return await handler(ctx)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return `Error executing ${name}: ${message}`
  }
}
