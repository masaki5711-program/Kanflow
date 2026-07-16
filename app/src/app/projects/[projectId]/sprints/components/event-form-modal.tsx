"use client"

import { useLanguage } from "@/lib/language-context"

interface EventFormState {
  title: string
  description: string
  date: string
  endDate: string
  color: string
  sprintId: string
}

interface SprintOption {
  id: string
  sprintName: string
}

interface EventFormModalProps {
  eventForm: EventFormState
  editingEventId: string | null
  sprints: SprintOption[]
  onSubmit: (e: React.FormEvent) => void
  onCancel: () => void
  onChange: (form: EventFormState) => void
}

const eventColorMap: Record<string, string> = {
  blue: "bg-blue-500",
  green: "bg-green-500",
  red: "bg-red-500",
  yellow: "bg-yellow-500",
  purple: "bg-purple-500",
  gray: "bg-gray-500",
}

export default function EventFormModal({
  eventForm,
  editingEventId,
  sprints,
  onSubmit,
  onCancel,
  onChange,
}: EventFormModalProps) {
  const { t } = useLanguage()

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-4">
          {editingEventId ? t.eventEdit : t.eventAdd}
        </h3>
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t.eventTitle}</label>
            <input
              type="text"
              value={eventForm.title}
              onChange={(e) => onChange({ ...eventForm, title: e.target.value })}
              required
              placeholder={t.eventTitlePlaceholder}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t.eventDescription}</label>
            <textarea
              value={eventForm.description}
              onChange={(e) => onChange({ ...eventForm, description: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t.eventStartDate}</label>
              <input
                type="date"
                value={eventForm.date}
                onChange={(e) => onChange({ ...eventForm, date: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t.eventEndDate}</label>
              <input
                type="date"
                value={eventForm.endDate}
                onChange={(e) => onChange({ ...eventForm, endDate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t.eventColor}</label>
              <div className="flex gap-2">
                {["blue", "green", "red", "yellow", "purple", "gray"].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => onChange({ ...eventForm, color: c })}
                    className={`w-6 h-6 rounded-full ${eventColorMap[c]} ${
                      eventForm.color === c ? "ring-2 ring-offset-1 ring-gray-400" : ""
                    }`}
                  />
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t.eventSprintLink}</label>
              <select
                value={eventForm.sprintId}
                onChange={(e) => onChange({ ...eventForm, sprintId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="">-- {t.eventNone} --</option>
                {sprints.map((s) => (
                  <option key={s.id} value={s.id}>{s.sprintName}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm">
              {editingEventId ? t.update : t.add}
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
