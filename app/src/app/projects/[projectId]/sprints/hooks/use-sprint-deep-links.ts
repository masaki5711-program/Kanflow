"use client"

import { useDeepLinkHighlight } from "@/hooks/use-deep-link-highlight"
import { useToast } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { findSprintById, findSprintOfTask, sprintElementId, taskElementId } from "../lib/deep-link"
import { isFilterActive, type TaskFilter } from "../components/board/board-model"
import type { Sprint } from "../components/types"

interface Options {
  sprints: readonly Sprint[]
  /** Sprints have loaded. */
  isReady: boolean
  /** Expand the sprint card (and show the archived list when needed). */
  revealSprint: (sprint: Sprint) => void
  filter: TaskFilter
  clearFilters: () => void
}

/**
 * `?task=<taskId>` (search, notifications, my tasks) and `?sprint=<sprintId>`
 * (sprint start / end notifications): expand the sprint, scroll to the task
 * row / board card or the sprint card, focus and highlight it.
 */
export function useSprintDeepLinks({ sprints, isReady, revealSprint, filter, clearFilters }: Options): void {
  const toast = useToast()
  const { t } = useLanguage()

  useDeepLinkHighlight("task", taskElementId, {
    isReady,
    reveal: (taskId) => {
      const sprint = findSprintOfTask(sprints, taskId)
      if (!sprint) return false
      revealSprint(sprint)
      // An active assignee / text filter may hide the task.
      if (isFilterActive(filter)) clearFilters()
      return true
    },
    onNotFound: () => toast.info(t.sprintDeepLinkTaskNotFound),
  })

  useDeepLinkHighlight("sprint", sprintElementId, {
    isReady,
    reveal: (sprintId) => {
      const sprint = findSprintById(sprints, sprintId)
      if (!sprint) return false
      revealSprint(sprint)
      return true
    },
    onNotFound: () => toast.info(t.sprintDeepLinkSprintNotFound),
  })
}
