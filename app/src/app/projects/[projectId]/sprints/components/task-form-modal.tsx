"use client"

import { useEffect, useState } from "react"
import { useLanguage } from "@/lib/language-context"

interface FixedTaskItem {
  id: string
  taskName: string
}

interface FixedTaskGroup {
  id: string
  taskName: string
  items: FixedTaskItem[]
}

interface SprintPbItem {
  id: string
  displayId: number
  initiative: string | null
  epic: string | null
  userStory: string | null
  workloadScore: number
}

interface SprintItem {
  id: string
  taskName: string | null
  assignee: string | null
  estimatedHours: number | null
  actualHours: number | null
  status: string
  pbItem: SprintPbItem
}

interface Sprint {
  id: string
  sprintName: string
  items: SprintItem[]
}

interface Member {
  id: string
  userId: string
  role: string
  user: { id: string; name: string; email: string }
}

interface TaskFormState {
  pbItemId: string
  taskName: string
  assignee: string
  estimatedHours: string
  actualHours: string
  status: string
}

interface TaskFormModalProps {
  taskForm: TaskFormState
  editingTaskId: string | null
  sprint: Sprint | undefined
  members: Member[]
  pointUnit: string
  projectId: string
  canEditPbi?: boolean
  onSubmit: (e: React.FormEvent) => void
  onCancel: () => void
  onChange: (form: TaskFormState) => void
  onBulkAdd?: (pbItemId: string, assignee: string | null, taskNames: string[]) => Promise<void>
  onPbiSaved?: () => void
}

interface PbiFullDetail {
  id: string
  initiative: string | null
  epic: string | null
  userStory: string | null
  acceptanceCriteria: string | null
  referenceDoc: string | null
  workloadScore: number
  status: string
  assignedPo: string | null
  poNote: string | null
}

export default function TaskFormModal({
  taskForm,
  editingTaskId,
  sprint,
  members,
  pointUnit,
  projectId,
  canEditPbi,
  onSubmit,
  onCancel,
  onChange,
  onBulkAdd,
  onPbiSaved,
}: TaskFormModalProps) {
  const { t, pt } = useLanguage()
  const [fixedTaskGroups, setFixedTaskGroups] = useState<FixedTaskGroup[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<string>("")
  const [bulkBusy, setBulkBusy] = useState(false)
  const [pbiDetail, setPbiDetail] = useState<PbiFullDetail | null>(null)
  const [pbiDirty, setPbiDirty] = useState(false)
  const [pbiExpanded, setPbiExpanded] = useState(false)
  const [pbiSaving, setPbiSaving] = useState(false)

  useEffect(() => {
    fetch("/api/user/fixed-tasks")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data: FixedTaskGroup[]) => setFixedTaskGroups(data))
      .catch(() => {})
  }, [])

  // Pull the full PBI record so the task-add modal can show every detail
  // (acceptance criteria, PO assignment, status, etc.) and not just the
  // initiative + user story already in sprint.items.
  useEffect(() => {
    const id = taskForm.pbItemId
    if (!id) {
      setPbiDetail(null)
      setPbiDirty(false)
      return
    }
    let cancelled = false
    fetch(`/api/projects/${projectId}/backlog/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data) => {
        if (cancelled) return
        setPbiDetail({
          id: data.id,
          initiative: data.initiative,
          epic: data.epic,
          userStory: data.userStory,
          acceptanceCriteria: data.acceptanceCriteria,
          referenceDoc: data.referenceDoc,
          workloadScore: data.workloadScore,
          status: data.status,
          assignedPo: data.assignedPo,
          poNote: data.poNote,
        })
        setPbiDirty(false)
      })
      .catch(() => { if (!cancelled) setPbiDetail(null) })
    return () => { cancelled = true }
  }, [projectId, taskForm.pbItemId])

  function patchPbiLocal(patch: Partial<PbiFullDetail>) {
    setPbiDetail((prev) => (prev ? { ...prev, ...patch } : prev))
    setPbiDirty(true)
  }

  async function savePbiIfDirty() {
    if (!pbiDetail || !pbiDirty || !canEditPbi) return
    setPbiSaving(true)
    try {
      const body: Record<string, unknown> = {
        initiative: pbiDetail.initiative,
        epic: pbiDetail.epic,
        userStory: pbiDetail.userStory,
        acceptanceCriteria: pbiDetail.acceptanceCriteria,
        referenceDoc: pbiDetail.referenceDoc,
        workloadScore: pbiDetail.workloadScore,
        status: pbiDetail.status,
        assignedPo: pbiDetail.assignedPo,
        poNote: pbiDetail.poNote,
      }
      await fetch(`/api/projects/${projectId}/backlog/${pbiDetail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      setPbiDirty(false)
      onPbiSaved?.()
    } finally {
      setPbiSaving(false)
    }
  }

  async function handleSubmitWrapper(e: React.FormEvent) {
    e.preventDefault()
    // Save PBI edits in parallel with task submit so the user only sees one
    // round-trip's worth of latency.
    await savePbiIfDirty()
    onSubmit(e)
  }

  if (!sprint) return null

  // PB items available for this sprint
  const sprintPbItems = [...new Map(sprint.items.map((i) => [i.pbItem.id, i.pbItem])).values()]
  const hasPbItems = sprintPbItems.length > 0
  const selectedPb = sprintPbItems.find((p) => p.id === taskForm.pbItemId)
  const selectedGroup = fixedTaskGroups.find((g) => g.id === selectedGroupId)
  const canBulkAdd =
    !editingTaskId &&
    !!onBulkAdd &&
    !!selectedGroup &&
    selectedGroup.items.length > 0 &&
    !!taskForm.pbItemId &&
    !bulkBusy

  async function handleBulkAdd() {
    if (!selectedGroup || !onBulkAdd) return
    if (!taskForm.pbItemId || selectedGroup.items.length === 0) return
    setBulkBusy(true)
    try {
      await onBulkAdd(
        taskForm.pbItemId,
        taskForm.assignee || null,
        selectedGroup.items.map((it) => it.taskName)
      )
    } finally {
      setBulkBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-2xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-4">
          {editingTaskId ? t.sprintTaskEdit : t.sprintAddTask}
          <span className="text-sm font-normal text-gray-500 ml-2">{sprint.sprintName}</span>
        </h3>

        {!editingTaskId && !hasPbItems && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-800 mb-4">
            {t.sprintAddPbi} — まず PBアイテムを取り込んでからタスクを追加してください。
          </div>
        )}

        <form onSubmit={handleSubmitWrapper} className="space-y-3">
          {!editingTaskId && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t.sprintPbItem}
                {selectedPb && (
                  <span className="ml-2 text-xs font-normal text-blue-600">
                    #{selectedPb.displayId} {selectedPb.initiative || selectedPb.userStory || ""}
                  </span>
                )}
              </label>
              <select
                value={taskForm.pbItemId}
                onChange={(e) => onChange({ ...taskForm, pbItemId: e.target.value })}
                required
                disabled={!hasPbItems}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm disabled:bg-gray-100 disabled:text-gray-400"
              >
                <option value="">-- {t.sprintSelect} --</option>
                {sprintPbItems.map((pb) => (
                  <option key={pb.id} value={pb.id}>
                    #{pb.displayId} {pb.initiative || pb.userStory || t.sprintNotEntered}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* PBI detail panel — collapsible, shows full PBI info and lets
              PO/SM/admin edit acceptance criteria, status, etc. inline */}
          {pbiDetail && (
            <div className="rounded-lg border border-blue-200 bg-blue-50/30">
              <button
                type="button"
                onClick={() => setPbiExpanded(!pbiExpanded)}
                className="w-full px-3 py-2 flex items-center justify-between text-xs font-semibold text-blue-700 hover:bg-blue-50"
              >
                <span className="inline-flex items-center gap-1.5">
                  <svg className={`w-3.5 h-3.5 transition-transform ${pbiExpanded ? "rotate-90" : ""}`} viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd"/>
                  </svg>
                  PBI 詳細 {canEditPbi ? "(編集可)" : "(参照)"}
                </span>
                {pbiDirty && <span className="text-[10px] text-amber-600">● 未保存</span>}
              </button>
              {pbiExpanded && (
                <div className="px-3 pb-3 space-y-2 bg-white border-t border-blue-100">
                  <PbiSubField label={pt.backlogInitiative} value={pbiDetail.initiative ?? ""}
                    readOnly={!canEditPbi}
                    onChange={(v) => patchPbiLocal({ initiative: v })} />
                  <PbiSubField label={pt.backlogEpic} value={pbiDetail.epic ?? ""}
                    readOnly={!canEditPbi}
                    onChange={(v) => patchPbiLocal({ epic: v })} />
                  <PbiSubField label={pt.backlogUserStory} value={pbiDetail.userStory ?? ""} multiline rows={4}
                    readOnly={!canEditPbi}
                    onChange={(v) => patchPbiLocal({ userStory: v })} />
                  <PbiSubField label={pt.backlogAcceptanceCriteria} value={pbiDetail.acceptanceCriteria ?? ""} multiline rows={6}
                    readOnly={!canEditPbi}
                    onChange={(v) => patchPbiLocal({ acceptanceCriteria: v })} />
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <p className="text-[10px] font-medium text-gray-500 mb-0.5">{pt.backlogWorkloadScore}</p>
                      <input type="number" min={0} step={1} value={String(pbiDetail.workloadScore)}
                        readOnly={!canEditPbi}
                        onChange={(e) => patchPbiLocal({ workloadScore: parseInt(e.target.value || "0", 10) })}
                        className="w-full px-2 py-1 text-xs border border-gray-200 rounded bg-white read-only:bg-gray-50" />
                    </div>
                    <div>
                      <p className="text-[10px] font-medium text-gray-500 mb-0.5">{pt.rolePO}</p>
                      <input type="text" value={pbiDetail.assignedPo ?? ""}
                        readOnly={!canEditPbi}
                        onChange={(e) => patchPbiLocal({ assignedPo: e.target.value })}
                        className="w-full px-2 py-1 text-xs border border-gray-200 rounded bg-white read-only:bg-gray-50" />
                    </div>
                    <div>
                      <p className="text-[10px] font-medium text-gray-500 mb-0.5">{t.sprintStatus}</p>
                      <select value={pbiDetail.status}
                        disabled={!canEditPbi}
                        onChange={(e) => patchPbiLocal({ status: e.target.value })}
                        className="w-full px-2 py-1 text-xs border border-gray-200 rounded bg-white disabled:bg-gray-50">
                        <option value="not_ready">Not Ready</option>
                        <option value="ready">Ready</option>
                        <option value="completed">Completed</option>
                      </select>
                    </div>
                  </div>
                  {pbiSaving && <p className="text-[10px] text-blue-600">保存中…</p>}
                </div>
              )}
            </div>
          )}

          {/* Fixed task group bulk add (only when adding new tasks) */}
          {!editingTaskId && onBulkAdd && fixedTaskGroups.length > 0 && (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-3 space-y-2">
              <label className="block text-xs font-semibold text-indigo-700">
                {t.fixedTasksApplyFromTemplate}
              </label>
              <select
                value={selectedGroupId}
                onChange={(e) => setSelectedGroupId(e.target.value)}
                className="w-full px-3 py-2 border border-indigo-200 bg-white rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">{t.fixedTasksSelectPlaceholder}</option>
                {fixedTaskGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.taskName} ({g.items.length})
                  </option>
                ))}
              </select>
              {selectedGroup && (
                <>
                  <div className="text-[11px] text-indigo-600 font-medium mt-1">
                    {t.fixedTasksBulkAddPreview}:
                  </div>
                  {selectedGroup.items.length === 0 ? (
                    <p className="text-xs text-gray-400">{t.fixedTasksItemEmpty}</p>
                  ) : (
                    <ul className="text-xs text-gray-700 space-y-0.5 pl-3">
                      {selectedGroup.items.map((it) => (
                        <li key={it.id} className="flex items-center gap-1.5">
                          <span className="text-indigo-300">•</span>
                          <span className="truncate">{it.taskName}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <button
                    type="button"
                    onClick={handleBulkAdd}
                    disabled={!canBulkAdd}
                    className="w-full mt-1 px-3 py-1.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm font-medium disabled:bg-indigo-300 disabled:cursor-not-allowed"
                  >
                    {t.fixedTasksBulkAdd}{selectedGroup.items.length > 0 ? ` (${selectedGroup.items.length})` : ""}
                  </button>
                </>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t.sprintTaskName}</label>
            <input
              type="text"
              value={taskForm.taskName}
              onChange={(e) => onChange({ ...taskForm, taskName: e.target.value })}
              required
              placeholder={t.taskNamePlaceholder}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t.sprintAssignee}</label>
              {(() => {
                const selected = (taskForm.assignee ?? "")
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
                function toggle(name: string, checked: boolean) {
                  const next = checked
                    ? Array.from(new Set([...selected, name]))
                    : selected.filter((s) => s !== name)
                  onChange({ ...taskForm, assignee: next.join(", ") })
                }
                return (
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 border border-gray-300 rounded-md">
                    {members.length === 0 ? (
                      <span className="text-xs text-gray-400">—</span>
                    ) : (
                      members.map((m) => {
                        const checked = selected.includes(m.user.name)
                        return (
                          <label
                            key={m.id}
                            className={`inline-flex items-center gap-1 text-xs cursor-pointer px-2 py-0.5 rounded-full border transition-colors ${
                              checked
                                ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                                : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="hidden"
                              checked={checked}
                              onChange={(e) => toggle(m.user.name, e.target.checked)}
                            />
                            {m.user.name}
                          </label>
                        )
                      })
                    )}
                  </div>
                )
              })()}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t.sprintEstimatedHoursShort} ({pointUnit})
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                value={taskForm.estimatedHours}
                onChange={(e) => onChange({ ...taskForm, estimatedHours: e.target.value })}
                placeholder={t.taskHoursPlaceholder}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          {editingTaskId && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t.sprintActualHoursShort} ({pointUnit})
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={taskForm.actualHours}
                  onChange={(e) => onChange({ ...taskForm, actualHours: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t.sprintStatus}</label>
                <select
                  value={taskForm.status}
                  onChange={(e) => onChange({ ...taskForm, status: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                >
                  <option value="todo">{t.taskTodo}</option>
                  <option value="in_progress">{t.taskInProgress}</option>
                  <option value="done">{t.taskDone}</option>
                </select>
              </div>
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm">
              {editingTaskId ? t.update : t.add}
            </button>
            <button type="button" onClick={onCancel} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 text-sm">
              {t.cancel}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function PbiSubField({
  label,
  value,
  onChange,
  multiline,
  rows,
  readOnly,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  multiline?: boolean
  rows?: number
  readOnly?: boolean
}) {
  return (
    <div>
      <p className="text-[10px] font-medium text-gray-500 mb-0.5">{label}</p>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows ?? 2}
          readOnly={readOnly}
          className={`w-full px-2 py-1 text-xs border border-gray-200 rounded bg-white read-only:bg-gray-50 resize-y ${rows && rows >= 6 ? "min-h-[120px]" : ""}`}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          readOnly={readOnly}
          className="w-full px-2 py-1 text-xs border border-gray-200 rounded bg-white read-only:bg-gray-50"
        />
      )}
    </div>
  )
}
