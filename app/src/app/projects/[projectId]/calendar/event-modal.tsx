"use client"

import {
  Sprint,
  EventFormState,
  EVENT_COLORS,
  eventColorDot,
} from "./calendar-types"
import { useOverlayClose } from "@/lib/use-overlay-close"

interface EventModalProps {
  show: boolean
  editingEventId: string | null
  eventForm: EventFormState
  sprints: Sprint[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any
  onFormChange: (form: EventFormState) => void
  onSave: (e: React.FormEvent) => void
  onDelete: () => void
  onClose: () => void
}

export default function EventModal({
  show,
  editingEventId,
  eventForm,
  sprints,
  t,
  onFormChange,
  onSave,
  onDelete,
  onClose,
}: EventModalProps) {
  if (!show) return null

  const hasError = !eventForm.title.trim() && eventForm.title !== ""
  const overlay = useOverlayClose(onClose)

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      {...overlay}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-gray-900">
              {editingEventId ? t.eventEdit : t.eventAdd}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={onSave} className="px-6 py-5 space-y-5">
          {/* Event Details Section */}
          <div className="space-y-4">
            {/* Title */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                {t.eventTitle}
              </label>
              <input
                type="text"
                value={eventForm.title}
                onChange={(e) => onFormChange({ ...eventForm, title: e.target.value })}
                required
                placeholder={t.eventTitlePlaceholder}
                className={`w-full px-3.5 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow ${
                  hasError ? "border-red-400 ring-1 ring-red-300" : "border-gray-200"
                }`}
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                {t.eventDescription}
              </label>
              <textarea
                value={eventForm.description}
                onChange={(e) => onFormChange({ ...eventForm, description: e.target.value })}
                rows={2}
                placeholder={t.eventDescriptionPlaceholder}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow resize-none"
              />
            </div>
          </div>

          {/* Date Range Section */}
          <div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  {t.eventStartDate}
                </label>
                <input
                  type="date"
                  value={eventForm.date}
                  onChange={(e) => onFormChange({ ...eventForm, date: e.target.value })}
                  required
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  {t.eventEndDate}
                </label>
                <input
                  type="date"
                  value={eventForm.endDate}
                  onChange={(e) => onFormChange({ ...eventForm, endDate: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Appearance Section */}
          <div className="grid grid-cols-2 gap-4">
            {/* Color picker */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                {t.eventColor}
              </label>
              <div className="flex gap-2.5">
                {EVENT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => onFormChange({ ...eventForm, color: c })}
                    className={`w-7 h-7 rounded-full ${eventColorDot[c]} transition-all relative ${
                      eventForm.color === c
                        ? "ring-2 ring-offset-2 ring-gray-400 scale-110"
                        : "hover:scale-105"
                    }`}
                  >
                    {eventForm.color === c && (
                      <svg className="w-3.5 h-3.5 text-white absolute inset-0 m-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Sprint link */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                {t.eventSprintLink}
              </label>
              <select
                value={eventForm.sprintId}
                onChange={(e) => onFormChange({ ...eventForm, sprintId: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              >
                <option value="">-- {t.eventNone} --</option>
                {sprints.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.sprintName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3 pt-3 border-t border-gray-100">
            <button
              type="submit"
              className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 text-sm font-semibold shadow-sm shadow-blue-200 transition-all"
            >
              {editingEventId ? t.update : t.add}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-xl text-sm font-medium transition-colors"
            >
              {t.cancel}
            </button>
            {editingEventId && (
              <button
                type="button"
                onClick={onDelete}
                className="ml-auto px-5 py-2.5 border border-red-300 text-red-600 rounded-xl hover:bg-red-50 text-sm font-medium transition-colors"
              >
                {t.delete}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
