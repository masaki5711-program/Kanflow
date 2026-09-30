"use client"

import { useCallback, useState } from "react"
import { useRouter } from "next/navigation"
import { apiFetch, useApiMutation } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import type { Category, Project } from "./types"

interface FavoriteVars {
  id: string
  next: boolean
}

interface ColorVars {
  id: string
  color: string | null
}

interface CategoryVars {
  categoryId: string
  projectId: string
  assign: boolean
}

interface RenameVars {
  id: string
  name: string
}

/**
 * Per-project write actions of the list (favorite, card color, category
 * assignment, rename). Favorite / color / category are optimistic with
 * rollback; every failure is surfaced as a toast.
 */
export function useProjectActions(initialCategories: Category[]) {
  const router = useRouter()
  const { t } = useLanguage()
  // Optimistic overrides keyed by project id (undefined = server value).
  const [favOverride, setFavOverride] = useState<Record<string, boolean | undefined>>({})
  const [colorOverride, setColorOverride] = useState<Record<string, string | null | undefined>>({})
  const [categories, setCategories] = useState(initialCategories)

  const isFav = useCallback((p: Project) => favOverride[p.id] ?? !!p.isFavorite, [favOverride])
  const cardColorOf = useCallback(
    (p: Project): string | null => (colorOverride[p.id] !== undefined ? (colorOverride[p.id] ?? null) : (p.cardColor ?? null)),
    [colorOverride],
  )

  const favorite = useApiMutation(
    ({ id, next }: FavoriteVars) => apiFetch(`/api/projects/${id}/favorite`, { method: next ? "POST" : "DELETE" }),
    {
      onMutate: ({ id, next }) => {
        const prev = favOverride[id]
        setFavOverride((m) => ({ ...m, [id]: next }))
        return prev
      },
      rollback: (prev, _err, { id }) => setFavOverride((m) => ({ ...m, [id]: prev })),
      toastOnError: () => t.projectFavoriteFailed,
    },
  )

  const color = useApiMutation(
    ({ id, color: c }: ColorVars) => apiFetch(`/api/projects/${id}`, { method: "PATCH", json: { cardColor: c } }),
    {
      onMutate: ({ id, color: c }) => {
        const prev = colorOverride[id]
        setColorOverride((m) => ({ ...m, [id]: c }))
        return prev
      },
      rollback: (prev, _err, { id }) => setColorOverride((m) => ({ ...m, [id]: prev })),
      toastOnError: () => t.projectCardColorFailed,
    },
  )

  const category = useApiMutation(
    ({ categoryId, projectId, assign }: CategoryVars) =>
      assign
        ? apiFetch(`/api/user/categories/${categoryId}/assignments`, { method: "POST", json: { projectId } })
        : apiFetch(
            `/api/user/categories/${categoryId}/assignments?projectId=${encodeURIComponent(projectId)}`,
            { method: "DELETE" },
          ),
    {
      onMutate: ({ categoryId, projectId, assign }) => {
        const prev = categories
        setCategories((list) =>
          list.map((c) =>
            c.id !== categoryId
              ? c
              : {
                  ...c,
                  assignments: assign
                    ? [...c.assignments, { projectId }]
                    : c.assignments.filter((a) => a.projectId !== projectId),
                },
          ),
        )
        return prev
      },
      rollback: (prev) => setCategories(prev),
      toastOnError: () => t.projectCategoryAssignFailed,
    },
  )

  const rename = useApiMutation(
    ({ id, name }: RenameVars) => apiFetch(`/api/projects/${id}`, { method: "PATCH", json: { name } }),
    {
      onSuccess: () => router.refresh(),
      toastOnError: (e) => `${t.projectRenameFailed}: ${e.message}`,
    },
  )

  function toggleFavorite(p: Project) {
    void favorite.mutate({ id: p.id, next: !isFav(p) })
  }

  function setCardColor(projectId: string, c: string | null) {
    void color.mutate({ id: projectId, color: c })
  }

  function toggleCategory(categoryId: string, projectId: string) {
    const cat = categories.find((c) => c.id === categoryId)
    if (!cat) return
    const assigned = cat.assignments.some((a) => a.projectId === projectId)
    void category.mutate({ categoryId, projectId, assign: !assigned })
  }

  /** Resolves true when the rename succeeded (or nothing changed). */
  async function renameProject(id: string, name: string): Promise<boolean> {
    try {
      await rename.mutateAsync({ id, name })
      return true
    } catch {
      // Already reported through toastOnError; keep the editor open for a retry.
      return false
    }
  }

  return {
    categories,
    isFav,
    cardColorOf,
    toggleFavorite,
    setCardColor,
    toggleCategory,
    renameProject,
    isRenaming: rename.isPending,
  }
}
