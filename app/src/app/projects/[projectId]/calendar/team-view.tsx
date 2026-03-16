"use client"

import { useMemo } from "react"
import {
  Sprint,
  ProjectMember,
  ViewMode,
  toDateStr,
  isSameDay,
  getInitials,
  buildCalendarDays,
  memberGradients,
  memberBlockColors,
  sprintStatusColor,
  sprintTextColor,
} from "./calendar-types"

interface TeamViewProps {
  members: ProjectMember[]
  sprints: Sprint[]
  calendarDays: Date[]
  currentMonth: number
  currentYear: number
  viewMode: ViewMode
  currentWeekStart: Date
  today: Date
}

const roleBadgeColors: Record<string, string> = {
  owner: "bg-amber-100 text-amber-700",
  admin: "bg-purple-100 text-purple-700",
  member: "bg-blue-100 text-blue-700",
  viewer: "bg-gray-100 text-gray-600",
}

export default function TeamView({
  members,
  sprints,
  calendarDays,
  currentMonth,
  currentYear,
  viewMode,
  currentWeekStart,
  today,
}: TeamViewProps) {
  const displayDays = useMemo(() => {
    if (viewMode === "week") {
      const days: Date[] = []
      for (let i = 0; i < 7; i++) {
        days.push(
          new Date(
            currentWeekStart.getFullYear(),
            currentWeekStart.getMonth(),
            currentWeekStart.getDate() + i
          )
        )
      }
      return days
    }
    return calendarDays.slice(0, 35)
  }, [viewMode, currentWeekStart, calendarDays])

  if (members.length === 0) return null

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-white">
      <div className="flex flex-1 min-h-0 overflow-auto">
        {/* Member column (sticky) */}
        <div className="w-44 shrink-0 border-r bg-white sticky left-0 z-10">
          {/* Header spacer */}
          <div className="h-10 border-b bg-gray-50/80 flex items-center px-3">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Members</span>
          </div>
          {/* Member rows */}
          {members.map((mem, mi) => (
            <div
              key={mem.id}
              className="h-14 flex items-center gap-2.5 px-3 border-b hover:bg-gray-50/50 transition-colors"
            >
              {/* Avatar with gradient */}
              <div
                className={`w-8 h-8 rounded-full bg-gradient-to-br ${
                  memberGradients[mi % memberGradients.length]
                } flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm`}
              >
                {getInitials(mem.user.name, mem.user.email)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-gray-800 truncate">
                  {mem.user.name ?? mem.user.email}
                </div>
                <span
                  className={`inline-block text-[9px] font-medium px-1.5 py-0.5 rounded-full mt-0.5 ${
                    roleBadgeColors[mem.role] ?? "bg-gray-100 text-gray-600"
                  }`}
                >
                  {mem.role}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Day columns */}
        <div className="flex flex-1">
          {displayDays.map((day, di) => {
            const dayStr = toDateStr(day)
            const isCurrentMonth = day.getMonth() === currentMonth
            const isToday = isSameDay(day, today)
            const isWeekend = day.getDay() === 0 || day.getDay() === 6

            return (
              <div
                key={di}
                className={`flex-1 min-w-[28px] flex flex-col ${isToday ? "bg-blue-50/40" : ""}`}
              >
                {/* Day header */}
                <div
                  className={`h-10 flex flex-col items-center justify-center border-b border-r ${
                    isWeekend ? "bg-gray-50/80" : "bg-gray-50/50"
                  }`}
                >
                  <span
                    className={`text-[9px] font-medium uppercase ${
                      isCurrentMonth ? "text-gray-500" : "text-gray-300"
                    }`}
                  >
                    {day.toLocaleDateString("default", { weekday: "narrow" })}
                  </span>
                  <span
                    className={`text-[10px] font-bold leading-tight ${
                      isToday
                        ? "bg-blue-600 text-white w-5 h-5 rounded-full flex items-center justify-center"
                        : isCurrentMonth
                        ? "text-gray-700"
                        : "text-gray-300"
                    }`}
                  >
                    {day.getDate()}
                  </span>
                </div>

                {/* Per-member cells */}
                {members.map((mem, mi) => {
                  const activeSprints = sprints.filter((sp) => {
                    const start = sp.startDate.split("T")[0]
                    const end = sp.endDate.split("T")[0]
                    return dayStr >= start && dayStr <= end
                  })
                  const hasSprint = activeSprints.length > 0

                  // Check if this is the first day of the sprint
                  const sprintStarting = activeSprints.find(
                    (sp) => sp.startDate.split("T")[0] === dayStr
                  )

                  return (
                    <div
                      key={mem.id}
                      className={`h-14 border-b border-r relative flex items-center ${
                        hasSprint ? "px-0.5" : ""
                      } ${isWeekend && !hasSprint ? "bg-gray-50/30" : ""}`}
                      title={
                        hasSprint
                          ? activeSprints.map((sp) => sp.sprintName).join(", ")
                          : undefined
                      }
                    >
                      {hasSprint && (
                        <div
                          className={`absolute inset-0.5 rounded ${
                            memberBlockColors[mi % memberBlockColors.length]
                          } border opacity-80`}
                        />
                      )}
                      {sprintStarting && (
                        <span
                          className={`relative z-10 text-[8px] font-semibold truncate px-1 ${
                            sprintTextColor[sprintStarting.status] ?? "text-gray-600"
                          }`}
                        >
                          {sprintStarting.sprintName}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
