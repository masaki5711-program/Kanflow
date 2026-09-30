import type { BacklogItem, BacklogResponse } from "../types"

export function pbi(id: string, displayId: number, over: Partial<BacklogItem> = {}): BacklogItem {
  return {
    id,
    displayId,
    initiative: `Initiative ${id}`,
    epic: null,
    userStory: `Story ${id}`,
    acceptanceCriteria: null,
    workloadScore: 3,
    status: "ready",
    assignedPo: null,
    sortOrder: displayId,
    completedAt: null,
    iceboxItemId: null,
    iceboxItem: null,
    productGoalId: null,
    productGoal: null,
    ...over,
  }
}

export function backlogResponse(over: Partial<BacklogResponse> = {}): BacklogResponse {
  return {
    readyItems: [
      pbi("a", 1, { initiative: "Alpha login" }),
      pbi("b", 2, { initiative: "Beta search" }),
      pbi("c", 3, { initiative: "Gamma login" }),
    ],
    notReadyItems: [pbi("d", 4, { status: "not_ready", initiative: "Delta" })],
    completedItems: [pbi("e", 5, { status: "completed", initiative: "Epsilon", completedAt: "2026-01-02T00:00:00Z" })],
    totalWorkload: 15,
    ...over,
  }
}
