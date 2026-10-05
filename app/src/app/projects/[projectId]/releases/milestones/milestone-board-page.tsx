"use client"

import { useCallback, useMemo, useState } from "react"
import Link from "next/link"
import { useParams, usePathname, useSearchParams } from "next/navigation"
import { FileStack, Flag, Settings2 } from "lucide-react"
import { Button, EmptyState, PageHeader, SkeletonCard, buttonClasses } from "@/components/ui"
import { ExcelExportButton } from "@/components/excel/excel-export-button"
import { useProjectDocumentTitle } from "@/components/app-shell/project-title-context"
import { fillTemplate } from "@/lib/fill-template"
import { useLanguage } from "@/lib/language-context"
import { milestonesUrl } from "@/lib/milestones/constants"
import { pickText } from "@/lib/translation/pick-text"
import type { EntityI18n } from "@/lib/translation/types"
import { PlanTemplateDialogs, type TemplateDialogMode } from "../../plan/templates/plan-template-dialogs"
import { BoardTabs } from "./board-tabs"
import { stageNameMap, type MilestoneBoard } from "./milestone-types"
import { SettingsDialog } from "./settings-dialog"
import { StagePanel } from "./stage-panel"
import { StageTrack } from "./stage-track"
import { SummaryStrip } from "./summary-strip"
import { useMilestoneBoard } from "./use-milestone-board"

const STAGE_PARAM = "stage"
const NO_ITEMS: never[] = []

/**
 * /releases of a general (その他) project: the マイルストーン・検収ボード.
 * Summary strip, the stage track (stages = top-level 全体計画 items), the
 * stage dialog (`?stage=<id>`) and the tabs below. No stages yet → a CTA that
 * opens the plan's template-load dialog.
 */
export function MilestoneBoardPage() {
  const projectId = useParams().projectId as string
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const { t, language } = useLanguage()
  useProjectDocumentTitle(t.msBoardTitle)
  const board = useMilestoneBoard(projectId)
  const { data, isLoading, refetch, write, patchPlanItem } = board
  const [tplMode, setTplMode] = useState<TemplateDialogMode>(null)
  const [showSettings, setShowSettings] = useState(false)
  const nameOf = useCallback((s: { name: string; i18n: unknown }) => pickText(s.i18n as EntityI18n, "name", s.name, language).text, [language])
  const selected = data?.stages.find((s) => s.id === searchParams.get(STAGE_PARAM)) ?? null

  function openStage(id: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (id) params.set(STAGE_PARAM, id)
    else params.delete(STAGE_PARAM)
    const query = params.toString()
    // Native history: Next.js syncs useSearchParams without a navigation (same as the KAIZEN board's ?item=).
    window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname)
  }

  const canEdit = data?.permissions.canEdit ?? false
  return (
    <div>
      <PageHeader
        title={t.msBoardTitle}
        description={data && data.templates.length > 0 ? fillTemplate(t.msTemplatesLine, { names: data.templates.join("、") }) : t.msBoardDesc}
        icon={<Flag className="h-6 w-6" />}
        actions={
          <>
            <ExcelExportButton href={`${milestonesUrl(projectId)}/export`} title={t.msExportTitle} iconOnlyOnPhone />
            {canEdit && (
              <Button variant="secondary" leftIcon={<Settings2 className="h-4 w-4" />} onClick={() => setShowSettings(true)}>
                {t.msSettings}
              </Button>
            )}
            {canEdit && (data?.stages.length ?? 0) > 0 && (
              <Button variant="secondary" leftIcon={<FileStack className="h-4 w-4" />} onClick={() => setTplMode("load")}>
                {t.msLoadTemplate}
              </Button>
            )}
          </>
        }
      />
      {!data && board.error ? (
        <EmptyState icon={<Flag className="h-8 w-8" />} title={t.releaseLoadFailed} />
      ) : isLoading || !data ? (
        <div className="space-y-4">
          <SkeletonCard label={t.loading} />
          <SkeletonCard />
        </div>
      ) : (
        <BoardBody projectId={projectId} data={data} nameOf={nameOf} write={write} onOpenStage={openStage} onLoadTemplate={() => setTplMode("load")} />
      )}
      {data && (
        <StagePanel
          projectId={projectId}
          board={data}
          stage={selected}
          nameOf={nameOf}
          punchCtx={punchContext(projectId, data, nameOf, write)}
          write={write}
          patchPlanItem={patchPlanItem}
          onClose={() => openStage(null)}
        />
      )}
      {showSettings && data && <SettingsDialog settings={data.settings} write={write} onClose={() => setShowSettings(false)} />}
      <PlanTemplateDialogs
        mode={tplMode}
        onMode={setTplMode}
        projectId={projectId}
        items={NO_ITEMS}
        nameOf={(i) => i.name}
        today={data?.todayKey ?? ""}
        onChanged={refetch}
        onLoaded={() => undefined}
        onScheduled={() => undefined}
      />
    </div>
  )
}

type NameOf = (s: { name: string; i18n: unknown }) => string

/** Stage + step options for the selects ("　" indents steps). */
function stageOptionsOf(data: MilestoneBoard, nameOf: NameOf) {
  return data.stages.flatMap((s) => [{ id: s.id, label: nameOf(s) }, ...s.steps.map((st) => ({ id: st.id, label: `${"　".repeat(st.depth)}${nameOf(st)}` }))])
}

function punchContext(projectId: string, data: MilestoneBoard, nameOf: NameOf, write: ReturnType<typeof useMilestoneBoard>["write"]) {
  return {
    projectId,
    todayKey: data.todayKey,
    members: data.members,
    stageOptions: stageOptionsOf(data, nameOf),
    stageNames: stageNameMap(data.stages, nameOf),
    canEdit: data.permissions.canEdit,
    canTrack: data.permissions.canTrack,
    write,
  }
}

interface BodyProps {
  projectId: string
  data: MilestoneBoard
  nameOf: NameOf
  write: ReturnType<typeof useMilestoneBoard>["write"]
  onOpenStage: (id: string) => void
  onLoadTemplate: () => void
}

function BoardBody({ projectId, data, nameOf, write, onOpenStage, onLoadTemplate }: BodyProps) {
  const { t } = useLanguage()
  const stageNames = useMemo(() => stageNameMap(data.stages, nameOf), [data.stages, nameOf])
  const stageOptions = useMemo(() => stageOptionsOf(data, nameOf), [data, nameOf])
  const ctx = useMemo(() => punchContext(projectId, data, nameOf, write), [projectId, data, nameOf, write])
  return (
    <>
      {!data.permissions.canTrack && <p className="mb-3 rounded-ui-md bg-info-soft px-3 py-2 text-caption text-info">{t.msReadOnly}</p>}
      <SummaryStrip board={data} nameOf={nameOf} onOpenStage={onOpenStage} />
      {data.stages.length === 0 ? (
        <EmptyState
          className="mb-5"
          icon={<Flag className="h-8 w-8" />}
          title={t.msEmptyTitle}
          description={data.permissions.canEdit ? t.msEmptyDesc : t.msEmptyNoEdit}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {data.permissions.canEdit && (
                <Button leftIcon={<FileStack className="h-4 w-4" />} onClick={onLoadTemplate}>
                  {t.msLoadTemplate}
                </Button>
              )}
              <Link href={`/projects/${projectId}/plan`} className={buttonClasses({ variant: "secondary" })}>
                {t.msOpenPlan}
              </Link>
            </div>
          }
        />
      ) : (
        <StageTrack stages={data.stages} punchItems={data.punchItems} nameOf={nameOf} onOpen={onOpenStage} />
      )}
      <BoardTabs projectId={projectId} board={data} stageNames={stageNames} stageOptions={stageOptions} punchCtx={ctx} write={write} />
    </>
  )
}
