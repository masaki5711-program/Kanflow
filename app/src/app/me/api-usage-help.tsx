"use client"

import { useSyncExternalStore } from "react"
import { useLanguage } from "@/lib/language-context"

export const API_V1_PATH = "/api/v1"
export const MCP_PATH = "/api/mcp"

const noopSubscribe = () => () => {}

/** This server's origin in the browser; "" during SSR (the path alone is shown then). */
function useOrigin(): string {
  return useSyncExternalStore(
    noopSubscribe,
    () => window.location.origin,
    () => "",
  )
}

/** Example request with a placeholder token (never the user's real token). */
export function apiExampleCommand(baseUrl: string): string {
  return `curl -H "Authorization: Bearer kfl_…" ${baseUrl}/projects`
}

/**
 * The agent-model setup script (`scripts/kanflow-setup.js`) for this server. It
 * asks for the token at a hidden prompt, so the command never carries it.
 */
export function mcpSetupCommand(origin: string): string {
  return `node scripts/kanflow-setup.js --url ${origin || "https://<kanflow-host>"}`
}

function CommandBlock({ children }: { children: string }) {
  return (
    <pre className="mt-1 overflow-x-auto rounded-ui-sm bg-surface-sunken px-2 py-1.5 font-mono text-fg">
      <code>{children}</code>
    </pre>
  )
}

/**
 * `/me` token section: the essentials of the REST API and of connecting Claude
 * Code to the Kanflow MCP, in place of a pointer to a repository file end users
 * cannot open (P-09).
 */
export function ApiUsageHelp() {
  const { t } = useLanguage()
  const origin = useOrigin()
  const baseUrl = `${origin}${API_V1_PATH}`
  return (
    <details className="mt-2 rounded-ui-md border border-border bg-surface-muted px-3 py-2 text-caption text-fg-muted">
      <summary className="cursor-pointer font-medium text-fg">{t.apiTokenDocsLink}</summary>
      <dl className="mt-2 space-y-2">
        <div>
          <dt className="font-medium text-fg">{t.apiTokenUsageBaseUrl}</dt>
          <dd>
            <code className="break-all font-mono text-fg">{baseUrl}</code>
          </dd>
        </div>
        <div>
          <dt className="font-medium text-fg">{t.apiTokenUsageExample}</dt>
          <dd>
            <CommandBlock>{apiExampleCommand(baseUrl)}</CommandBlock>
          </dd>
        </div>
      </dl>
      <p className="mt-2">{t.apiTokenUsageAuth}</p>
      <p className="mt-1">{t.apiTokenUsageEndpoints}</p>

      <dl className="mt-3 space-y-2 border-t border-border pt-2">
        <div>
          <dt className="font-medium text-fg">{t.apiTokenUsageMcpUrl}</dt>
          <dd>
            <code className="break-all font-mono text-fg">{`${origin}${MCP_PATH}`}</code>
          </dd>
        </div>
      </dl>
      <p className="mt-2">{t.apiTokenUsageScopes}</p>
      <p className="mt-1">{t.apiTokenUsageMcpSetup}</p>
      <CommandBlock>{mcpSetupCommand(origin)}</CommandBlock>
      <p className="mt-1">{t.apiTokenUsageMcpAfter}</p>
      <p role="note" className="mt-2 rounded-ui-sm bg-warning-soft px-2 py-1.5 text-fg">
        {t.apiTokenUsageNeverPaste}
      </p>
    </details>
  )
}
