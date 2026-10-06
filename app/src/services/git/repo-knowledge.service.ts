import { z } from "zod"
import { prisma } from "@/lib/prisma"
import type { ActivityChanges } from "@/services/_shared/activity"
import { isIndexing } from "./repo-index-runner"
import { normalizePathFilter, parsePathFilter } from "./repo-index-rules"

/**
 * "AI の参照資料として使う" settings of a repository (PO / SM only, via the
 * repository PATCH): the switch, the folder filter, and the index status the
 * settings / Git page show. Switching off deletes the stored passages at once,
 * so the content stops being visible through the AI immediately.
 */

export const aiPathFilterField = z
  .string()
  .max(1000)
  .nullable()
  .refine((v) => v === null || parsePathFilter(v) !== null, {
    message: "フォルダの指定を認識できません（例: docs/, specs/ のようにカンマか改行で区切ってください）。",
  })

export interface KnowledgeInput {
  aiKnowledge?: boolean
  aiPathFilter?: string | null
}

interface KnowledgeState {
  aiKnowledge: boolean
  aiPathFilter: string | null
}

/** Clears the index state so the next pass is a full one (a filter change also drops newly excluded files). */
const RESTART = { indexedSha: null, indexTargetSha: null, indexCursor: null, indexError: null, indexErrorAt: null } as const
/** Nothing indexed any more. */
const CLEARED = { ...RESTART, indexedAt: null, indexedFiles: 0 } as const

export interface KnowledgePatch {
  data: Record<string, unknown>
  /** Delete every stored passage of the repository (switched off). */
  purge: boolean
  /** Start an index pass now (switched on / filter changed while on). */
  reindex: boolean
  changes: ActivityChanges
}

/** Pure: the column updates, side effects and activity-log entries of a knowledge settings change. */
export function knowledgePatch(before: KnowledgeState, input: KnowledgeInput): KnowledgePatch {
  const on = input.aiKnowledge ?? before.aiKnowledge
  const filter = input.aiPathFilter === undefined ? before.aiPathFilter : normalizePathFilter(input.aiPathFilter)
  const switched = on !== before.aiKnowledge
  const filterChanged = filter !== before.aiPathFilter
  const changes: ActivityChanges = {
    ...(switched ? { "git.aiKnowledge": { from: before.aiKnowledge, to: on } } : {}),
    ...(filterChanged ? { "git.aiPathFilter": { from: before.aiPathFilter, to: filter } } : {}),
  }
  const reset = switched ? CLEARED : filterChanged && on ? RESTART : {}
  return {
    data: { ...(switched ? { aiKnowledge: on } : {}), ...(filterChanged ? { aiPathFilter: filter } : {}), ...reset },
    purge: switched && !on,
    reindex: on && (switched || filterChanged),
    changes,
  }
}

export interface RepositoryKnowledgeDto {
  aiKnowledge: boolean
  aiPathFilter: string | null
  indexedAt: string | null
  indexedFiles: number
  indexError: string | null
  indexErrorAt: string | null
  /** Being indexed right now in this server process. */
  indexing: boolean
  /** Switched on but not (completely) indexed yet; the poller / next run continues it. */
  indexPending: boolean
}

interface KnowledgeRow extends KnowledgeState {
  id: string
  indexedSha: string | null
  indexedAt: Date | null
  indexedFiles: number
  indexError: string | null
  indexErrorAt: Date | null
  indexTargetSha: string | null
}

export function toKnowledgeDto(r: KnowledgeRow): RepositoryKnowledgeDto {
  return {
    aiKnowledge: r.aiKnowledge,
    aiPathFilter: r.aiPathFilter,
    indexedAt: r.indexedAt?.toISOString() ?? null,
    indexedFiles: r.indexedFiles,
    indexError: r.indexError,
    indexErrorAt: r.indexErrorAt?.toISOString() ?? null,
    indexing: isIndexing(r.id),
    // A filter change clears indexedSha but keeps the last import time: still pending until the new pass ends.
    indexPending: r.aiKnowledge && (!!r.indexTargetSha || !r.indexedAt || !r.indexedSha),
  }
}

/** The repository of this project (or null), with its knowledge switch. */
export function findKnowledgeRepository(projectId: string, repositoryId: string) {
  return prisma.gitRepository.findFirst({ where: { id: repositoryId, projectId }, select: { id: true, aiKnowledge: true } })
}
