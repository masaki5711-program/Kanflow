"use client"

import { useLanguage } from "@/lib/language-context"

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
  onSubmit: (e: React.FormEvent) => void
  onCancel: () => void
  onChange: (form: TaskFormState) => void
}

export default function TaskFormModal({
  taskForm,
  editingTaskId,
  sprint,
  members,
  pointUnit,
  onSubmit,
  onCancel,
  onChange,
}: TaskFormModalProps) {
  const { t } = useLanguage()

  if (!sprint) return null

  // PB items available for this sprint
  const sprintPbItems = [...new Map(sprint.items.map((i) => [i.pbItem.id, i.pbItem])).values()]

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onCancel}>
      <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-4">
          {editingTaskId ? t.sprintTaskEdit : t.sprintAddTask}
          <span className="text-sm font-normal text-gray-500 ml-2">{sprint.sprintName}</span>
        </h3>
        <form onSubmit={onSubmit} className="space-y-3">
          {!editingTaskId && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t.sprintPbItem}</label>
              <select
                value={taskForm.pbItemId}
                onChange={(e) => onChange({ ...taskForm, pbItemId: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t.sprintTaskName}</label>
            <input
              type="text"
              value={taskForm.taskName}
              onChange={(e) => onChange({ ...taskForm, taskName: e.target.value })}
              required
              placeholder="例: API実装、画面デザイン"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t.sprintAssignee}</label>
              <select
                value={taskForm.assignee}
                onChange={(e) => onChange({ ...taskForm, assignee: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="">-- {t.sprintUnassigned} --</option>
                {members.map((m) => (
                  <option key={m.id} value={m.user.name}>
                    {m.user.name} ({m.role.toUpperCase()})
                  </option>
                ))}
              </select>
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
                placeholder="例: 4"
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
