"use client"

import { useRouter } from "next/navigation"
import { Button, useConfirm } from "@/components/ui"
import { apiFetch, useApiMutation } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import { SettingsCard } from "./settings-card"

function WarningIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 3.68V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z"
        clipRule="evenodd"
      />
    </svg>
  )
}

export function DangerZoneSection({ projectId }: { projectId: string }) {
  const { t } = useLanguage()
  const router = useRouter()
  const confirm = useConfirm()

  const deleteProject = useApiMutation(
    () => apiFetch(`/api/projects/${projectId}`, { method: "DELETE" }),
    {
      onSuccess: () => router.push("/"),
      toastOnError: (err) => err.message || t.settingsDeleteProjectFailed,
    },
  )

  async function handleDelete() {
    const ok = await confirm({
      title: t.settingsDeleteProject,
      message: t.settingsDeleteProjectConfirm,
      confirmLabel: t.trashMoveToTrash,
      cancelLabel: t.cancel,
      variant: "danger",
    })
    if (ok) deleteProject.mutate(undefined)
  }

  return (
    <SettingsCard
      tone="danger"
      title={
        <>
          <WarningIcon />
          {t.settingsDangerZone}
        </>
      }
    >
      <p className="mb-4 text-body text-fg-muted">{t.settingsDeleteProjectWarning}</p>
      <Button variant="danger" leftIcon={<TrashIcon />} loading={deleteProject.isPending} onClick={handleDelete}>
        {t.settingsDeleteProject}
      </Button>
    </SettingsCard>
  )
}
