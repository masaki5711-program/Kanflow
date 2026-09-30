"use client"

import { useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Skeleton, useConfirm, PageHeader } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import WeekView from "./week-view"
import TeamView from "./team-view"
import EventModal from "./event-modal"
import MiniCalendar from "./mini-calendar"
import MonthGrid from "./month-grid"
import CalendarHeader from "./calendar-header"
import DeadlineDialog, { type DeadlineInfo } from "./deadline-dialog"
import { useCalendarData } from "./use-calendar-data"
import { useCalendarNav } from "./use-calendar-nav"
import { useDragCreate } from "./use-drag-create"
import {
  type CalendarEvent,
  type DeadlineEntry,
  type EventFormState,
  buildCalendarDays,
  emptyForm,
  eventToForm,
  toDateStr,
} from "./calendar-types"
import { useProjectDocumentTitle } from "@/components/app-shell/project-title-context"

interface ModalState {
  /** Bumped on every open so the form remounts with fresh values. */
  key: number
  editingEventId: string | null
  initialForm: EventFormState
}

export default function CalendarPage() {
  const params = useParams()
  const projectId = params.projectId as string
  const router = useRouter()
  const { t, language } = useLanguage()
  useProjectDocumentTitle(t.calendarTitle)
  const confirm = useConfirm()

  const today = useMemo(() => new Date(), [])
  const nav = useCalendarNav(today, language)
  const data = useCalendarData(projectId)

  const [modal, setModal] = useState<ModalState | null>(null)
  const [deadlineInfo, setDeadlineInfo] = useState<DeadlineInfo | null>(null)
  const [expandedDay, setExpandedDay] = useState<string | null>(null)

  const calendarDays = useMemo(
    () => buildCalendarDays(nav.currentYear, nav.currentMonth),
    [nav.currentYear, nav.currentMonth],
  )

  function openCreateForm(dateStr: string, endDateStr?: string) {
    setModal((m) => ({
      key: (m?.key ?? 0) + 1,
      editingEventId: null,
      initialForm: { ...emptyForm, date: dateStr, endDate: endDateStr ?? "" },
    }))
  }

  function openEditForm(ev: CalendarEvent) {
    setModal((m) => ({ key: (m?.key ?? 0) + 1, editingEventId: ev.id, initialForm: eventToForm(ev) }))
  }

  const closeModal = () => setModal(null)

  const drag = useDragCreate(nav.viewMode === "month", openCreateForm)

  async function handleSave(form: EventFormState) {
    if (!modal) return
    try {
      // Edits are applied optimistically behind the dialog; errors roll back + toast.
      await data.saveEvent.mutateAsync({ id: modal.editingEventId, form })
      closeModal()
    } catch {
      // Keep the dialog open so the user's input is not lost (toast already shown).
    }
  }

  async function handleDelete() {
    const id = modal?.editingEventId
    if (!id) return
    const ok = await confirm({ message: t.eventDeleteConfirm, variant: "danger" })
    if (!ok) return
    closeModal()
    await data.deleteEvent.mutate(id)
  }

  function handleDeadlineBadgeClick(dateStr: string, entries: DeadlineEntry[]) {
    setDeadlineInfo({
      dateStr,
      tasks: entries.flatMap((en) => en.tasks),
      sprintName: entries.map((en) => en.sprintName).join(", "),
    })
  }

  const header = <PageHeader title={t.calendarTitle} className="mb-4" />

  if (data.isLoading) {
    return (
      <div className="flex flex-col h-full min-h-0">
        {header}
        <CalendarSkeleton label={t.loading} />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0" onMouseUp={drag.onMouseUp} onMouseLeave={drag.onMouseLeave}>
      {header}
      <CalendarHeader
        periodLabel={nav.periodLabel}
        viewMode={nav.viewMode}
        onViewModeChange={nav.setViewMode}
        onPrev={nav.goPrev}
        onNext={nav.goNext}
        onToday={nav.goToday}
        onAddEvent={() => openCreateForm(toDateStr(today))}
      />

      <div className="flex flex-1 min-h-0">
        {nav.viewMode === "team" ? (
          <TeamView
            members={data.members}
            sprints={data.sprints}
            calendarDays={calendarDays}
            currentMonth={nav.currentMonth}
            today={today}
            locale={nav.locale}
          />
        ) : nav.viewMode === "week" ? (
          <div className="flex-1 flex flex-col min-h-0">
            <WeekView
              weekStart={nav.currentWeekStart}
              events={data.events}
              weekdays={t.calendarWeekdays}
              locale={nav.locale}
              onEventClick={openEditForm}
              onSlotClick={(dateStr) => openCreateForm(dateStr)}
            />
          </div>
        ) : (
          <>
            <div className="flex-1 flex flex-col min-h-0">
              <MonthGrid
                calendarDays={calendarDays}
                currentMonth={nav.currentMonth}
                today={today}
                locale={nav.locale}
                events={data.events}
                sprintPhases={data.sprintPhases}
                taskDeadlinesByDate={data.taskDeadlinesByDate}
                expandedDay={expandedDay}
                dragStart={drag.dragStart}
                isMultiDayDrag={drag.isMultiDayDrag}
                isDayInDragRange={drag.isDayInDragRange}
                onDayMouseDown={drag.onDayMouseDown}
                onDayMouseEnter={drag.onDayMouseEnter}
                onDayClick={openCreateForm}
                onEventClick={openEditForm}
                onSprintBarClick={(sprintId) => router.push(`/projects/${projectId}/sprints?sprint=${encodeURIComponent(sprintId)}`)}
                onDeadlineBadgeClick={handleDeadlineBadgeClick}
                onExpandDay={setExpandedDay}
              />
            </div>
            <MiniCalendar
              currentYear={nav.currentYear}
              currentMonth={nav.currentMonth}
              today={today}
              events={data.events}
              weekdays={t.calendarWeekdays}
              locale={nav.locale}
              onDateClick={nav.showMonthOf}
            />
          </>
        )}
      </div>

      <DeadlineDialog info={deadlineInfo} onClose={() => setDeadlineInfo(null)} />

      {modal && (
        <EventModal
          key={modal.key}
          open
          editingEventId={modal.editingEventId}
          initialForm={modal.initialForm}
          sprints={data.sprints}
          saving={data.saveEvent.isPending}
          deleting={data.deleteEvent.isPending}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={closeModal}
        />
      )}
    </div>
  )
}

function CalendarSkeleton({ label }: { label: string }) {
  return (
    <div className="flex flex-col h-full min-h-0" role="status" aria-label={label}>
      <div className="flex items-center justify-between px-5 py-3 border-b border-border">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-8 w-40" />
      </div>
      <div className="grid grid-cols-7 gap-px flex-1 p-px">
        {Array.from({ length: 35 }, (_, i) => (
          <Skeleton key={`cell-${i}`} className="min-h-[100px] rounded-none" />
        ))}
      </div>
    </div>
  )
}
