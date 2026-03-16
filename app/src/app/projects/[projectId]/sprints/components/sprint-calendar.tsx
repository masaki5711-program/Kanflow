"use client"

import { useState } from "react"
import { useLanguage } from "@/lib/language-context"

interface CalendarEvent {
  id: string
  title: string
  description: string | null
  date: string
  endDate: string | null
  color: string
  sprintId: string | null
  sprint: { id: string; sprintName: string } | null
}

interface SprintSummary {
  id: string
  sprintName: string
  startDate: string
  endDate: string
  status: string
}

interface SprintCalendarProps {
  events: CalendarEvent[]
  sprints: SprintSummary[]
  onAddEvent: (dateStr?: string) => void
  onEditEvent: (ev: CalendarEvent) => void
  onDeleteEvent: (eventId: string) => void
  showCalendar: boolean
  onToggle: () => void
  currentMonth: Date
  onMonthChange: (month: Date) => void
}

const eventColorBg: Record<string, string> = {
  blue: "bg-blue-100 text-blue-800 border-blue-200",
  green: "bg-green-100 text-green-800 border-green-200",
  red: "bg-red-100 text-red-800 border-red-200",
  yellow: "bg-yellow-100 text-yellow-800 border-yellow-200",
  purple: "bg-purple-100 text-purple-800 border-purple-200",
  gray: "bg-gray-100 text-gray-800 border-gray-200",
}

function getDaysInMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
}

function getFirstDayOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1).getDay()
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function isInRange(day: Date, start: Date, end: Date) {
  return day.getTime() >= start.getTime() && day.getTime() <= end.getTime()
}

function toDateStr(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

export default function SprintCalendar({
  events,
  sprints,
  onAddEvent,
  onEditEvent,
  onDeleteEvent,
  showCalendar,
  onToggle,
  currentMonth,
  onMonthChange,
}: SprintCalendarProps) {
  const { language, t } = useLanguage()
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  if (!showCalendar) return null

  function getEventsForDay(cellDate: Date) {
    return events.filter((ev) => {
      const evDate = new Date(ev.date)
      evDate.setHours(0, 0, 0, 0)
      if (ev.endDate) {
        const evEnd = new Date(ev.endDate)
        evEnd.setHours(0, 0, 0, 0)
        return isInRange(cellDate, evDate, evEnd)
      }
      return isSameDay(cellDate, evDate)
    })
  }

  const daysInMonth = getDaysInMonth(currentMonth)
  const firstDay = getFirstDayOfMonth(currentMonth)
  const days: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) days.push(null)
  for (let i = 1; i <= daysInMonth; i++) days.push(i)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const selectedDateEvents = selectedDate
    ? getEventsForDay(new Date(selectedDate))
    : []

  const selectedDateSprints = selectedDate
    ? sprints.filter((s) => {
        const start = new Date(s.startDate); start.setHours(0, 0, 0, 0)
        const end = new Date(s.endDate); end.setHours(0, 0, 0, 0)
        const sel = new Date(selectedDate); sel.setHours(0, 0, 0, 0)
        return isInRange(sel, start, end)
      })
    : []

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => onMonthChange(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
          className="text-sm text-gray-500 hover:text-gray-700 px-2"
        >&#9664;</button>
        <h3 className="text-sm font-semibold">
          {currentMonth.toLocaleDateString(language === "ja" ? "ja-JP" : language === "id" ? "id-ID" : "en-US", { year: "numeric", month: "long" })}
        </h3>
        <button
          onClick={() => onMonthChange(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
          className="text-sm text-gray-500 hover:text-gray-700 px-2"
        >&#9654;</button>
      </div>

      <div className="grid grid-cols-7 gap-px text-xs text-center">
        {t.calendarWeekdays.map((d) => (
          <div key={d} className="py-1 font-medium text-gray-500">{d}</div>
        ))}
        {days.map((day, idx) => {
          if (day === null) return <div key={`e-${idx}`} />

          const cellDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day)
          cellDate.setHours(0, 0, 0, 0)
          const dateStr = toDateStr(currentMonth.getFullYear(), currentMonth.getMonth(), day)
          const isToday = isSameDay(cellDate, today)
          const isSelected = selectedDate === dateStr

          const sprintsOnDay = sprints.filter((s) => {
            const start = new Date(s.startDate); start.setHours(0, 0, 0, 0)
            const end = new Date(s.endDate); end.setHours(0, 0, 0, 0)
            return isInRange(cellDate, start, end)
          })

          const dayEvents = getEventsForDay(cellDate)

          return (
            <div
              key={day}
              onClick={() => setSelectedDate(isSelected ? null : dateStr)}
              className={`py-1 px-0.5 min-h-[64px] rounded text-xs relative cursor-pointer transition-colors overflow-hidden ${
                isToday ? "bg-blue-50 font-bold text-blue-700" : ""
              } ${isSelected ? "ring-2 ring-blue-500" : "hover:bg-gray-50"}`}
            >
              <span>{day}</span>
              {sprintsOnDay.map((s) => {
                const start = new Date(s.startDate); start.setHours(0, 0, 0, 0)
                const end = new Date(s.endDate); end.setHours(0, 0, 0, 0)
                const isStart = isSameDay(cellDate, start)
                const isEnd = isSameDay(cellDate, end)
                const color = s.status === "done" ? "bg-green-200" : s.status === "active" ? "bg-blue-200" : "bg-yellow-200"
                return (
                  <div
                    key={s.id}
                    className={`mt-0.5 h-1.5 ${color} ${isStart ? "rounded-l" : ""} ${isEnd ? "rounded-r" : ""}`}
                    title={s.sprintName}
                  />
                )
              })}
              {dayEvents.slice(0, 3).map((ev) => (
                <div
                  key={ev.id}
                  className={`mt-0.5 px-0.5 py-px text-[9px] leading-tight truncate rounded-sm ${eventColorBg[ev.color] ?? eventColorBg.blue}`}
                  title={ev.title}
                >
                  {ev.title}
                </div>
              ))}
              {dayEvents.length > 3 && (
                <div className="text-[9px] text-gray-400 mt-0.5">+{dayEvents.length - 3}</div>
              )}
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex gap-4 mt-3 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-yellow-200 inline-block" /> {t.sprintStatusPlanning}</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-blue-200 inline-block" /> {t.sprintStatusActive}</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-green-200 inline-block" /> {t.sprintStatusDone}</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-blue-500 inline-block" /> {t.eventEvents}</span>
      </div>

      {/* Selected day detail */}
      {selectedDate && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold">
              {new Date(selectedDate).toLocaleDateString(language === "ja" ? "ja-JP" : language === "id" ? "id-ID" : "en-US", { month: "long", day: "numeric", weekday: "short" })}
            </h4>
            <button
              onClick={() => onAddEvent(selectedDate)}
              className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              {t.eventAdd}
            </button>
          </div>

          {selectedDateSprints.length > 0 && (
            <div className="mb-2">
              {selectedDateSprints.map((s) => (
                <div key={s.id} className="text-xs px-2 py-1 mb-1 rounded bg-gray-100 text-gray-700">
                  Sprint: {s.sprintName} ({s.status})
                </div>
              ))}
            </div>
          )}

          {selectedDateEvents.length > 0 ? (
            <div className="space-y-1">
              {selectedDateEvents.map((ev) => (
                <div key={ev.id} className={`text-xs px-2 py-1.5 rounded border ${eventColorBg[ev.color] ?? eventColorBg.blue} flex items-center justify-between`}>
                  <div>
                    <span className="font-medium">{ev.title}</span>
                    {ev.description && <span className="ml-2 opacity-70">{ev.description}</span>}
                    {ev.sprint && <span className="ml-2 opacity-60">({ev.sprint.sprintName})</span>}
                  </div>
                  <div className="flex gap-1 ml-2">
                    <button onClick={() => onEditEvent(ev)} className="text-blue-600 hover:text-blue-800">{t.edit}</button>
                    <button onClick={() => onDeleteEvent(ev.id)} className="text-red-500 hover:text-red-700">{t.delete}</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400">{t.calendarNoEvents}</p>
          )}
        </div>
      )}
    </div>
  )
}
