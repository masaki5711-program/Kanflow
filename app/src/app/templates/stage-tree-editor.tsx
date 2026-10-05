"use client"

import { useEffect, useRef } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { TEMPLATE_MAX_DEPTH, TEMPLATE_MAX_NODES } from "@/lib/plan-templates/schema"
import { appendChild, indentNode, insertAfter, moveNode, outdentNode, removeNode, subtreeDepth, updateNode, type OpResult } from "@/lib/plan-templates/stage-ops"
import { countEditorNodes, emptyStage, type EditorNode } from "./lib/editor-state"
import { StageRowEditor, type StageOp } from "./stage-row-editor"

interface Props {
  stages: EditorNode[]
  onChange: (stages: EditorNode[]) => void
  disabled: boolean
}

interface FlatEditorRow {
  node: EditorNode
  path: number[]
  siblings: number
}

function flatten(nodes: readonly EditorNode[], parent: number[] = []): FlatEditorRow[] {
  return nodes.flatMap((node, i) => [{ node, path: [...parent, i], siblings: nodes.length }, ...flatten(node.children, [...parent, i])])
}

/** Pure: apply one structural op; null when not possible (the button is disabled then anyway). */
export function applyStageOp(nodes: EditorNode[], path: number[], op: StageOp): OpResult<EditorNode> | null {
  switch (op) {
    case "up":
      return moveNode(nodes, path, -1)
    case "down":
      return moveNode(nodes, path, 1)
    case "indent":
      return indentNode(nodes, path)
    case "outdent":
      return outdentNode(nodes, path)
    case "child":
      return appendChild(nodes, path, emptyStage())
    case "remove":
      return removeNode(nodes, path)
  }
}

/**
 * Stage tree editor: one row per stage (indented), structure changed with
 * buttons only (keyboard accessible). After a move the focus follows the
 * stage (same button when it is still enabled, else its name field).
 */
export function StageTreeEditor({ stages, onChange, disabled }: Props) {
  const { t } = useLanguage()
  const listRef = useRef<HTMLUListElement>(null)
  const pendingFocus = useRef<{ key: string; op: StageOp | null } | null>(null)
  const full = countEditorNodes(stages) >= TEMPLATE_MAX_NODES
  const rows = flatten(stages)

  useEffect(() => {
    const target = pendingFocus.current
    if (!target) return
    pendingFocus.current = null
    const row = listRef.current?.querySelector<HTMLElement>(`[data-stage-key="${target.key}"]`)
    const button = target.op ? row?.querySelector<HTMLButtonElement>(`[data-op="${target.op}"]`) : null
    const el = button && !button.disabled ? button : row?.querySelector<HTMLInputElement>("[data-stage-input]")
    el?.focus()
  }, [stages])

  function run(row: FlatEditorRow, op: StageOp) {
    const result = applyStageOp(stages, row.path, op)
    if (!result) return
    const moved = op === "child" || op === "remove" ? null : row.node.key
    const focusNode = flatten(result.nodes).find((r) => r.path.join(".") === result.focus.join("."))?.node
    pendingFocus.current = moved ? { key: moved, op } : focusNode ? { key: focusNode.key, op: null } : null
    onChange(result.nodes)
  }

  function addTop() {
    const result = insertAfter(stages, null, emptyStage())
    pendingFocus.current = { key: result.nodes[result.nodes.length - 1].key, op: null }
    onChange(result.nodes)
  }

  return (
    <div className="space-y-2">
      {rows.length === 0 ? (
        <p className="rounded-ui-md border border-dashed border-border-strong p-4 text-center text-body text-fg-muted">{t.tplNoStages}</p>
      ) : (
        <ul ref={listRef} aria-label={t.tplStages} className="space-y-1">
          {rows.map((row) => {
            const depth = row.path.length - 1
            const index = row.path[row.path.length - 1]
            return (
              <StageRowEditor
                key={row.node.key}
                node={row.node}
                depth={depth}
                disabled={disabled}
                can={{
                  up: index > 0,
                  down: index < row.siblings - 1,
                  indent: index > 0 && row.path.length + subtreeDepth(row.node) <= TEMPLATE_MAX_DEPTH,
                  outdent: depth > 0,
                  child: !full && row.path.length < TEMPLATE_MAX_DEPTH,
                }}
                onField={(patch) => onChange(updateNode(stages, row.path, (n) => ({ ...n, ...patch })))}
                onOp={(op) => run(row, op)}
              />
            )
          })}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={addTop} disabled={disabled || full} data-testid="tpl-add-stage">
          {t.tplAddStage}
        </Button>
        {full && <span className="text-caption text-warning-hover">{t.tplLimitReached}</span>}
      </div>
    </div>
  )
}
