// SVG icon helpers shared by the sprint tab components. Heroicons-style,
// 20x20 viewBox, fill=currentColor. No user-facing strings here.

type IC = { className?: string }
const S = (p: IC & { d: string; children?: React.ReactNode }) => (
  <svg className={p.className} viewBox="0 0 20 20" fill="currentColor">{p.children}<path d={p.d} /></svg>
)
const Sf = (p: IC & { d: string; children?: React.ReactNode }) => (
  <svg className={p.className} viewBox="0 0 20 20" fill="currentColor">{p.children}<path fillRule="evenodd" d={p.d} clipRule="evenodd" /></svg>
)
export function IconBolt({ className = "w-5 h-5" }: IC) {
  return <S className={className} d="M11.983 1.907a.75.75 0 00-1.292-.657l-8.5 9.5A.75.75 0 002.75 12h6.572l-1.305 6.093a.75.75 0 001.292.657l8.5-9.5A.75.75 0 0017.25 8h-6.572l1.305-6.093z" />
}
export function IconChevron({ open, className = "w-5 h-5" }: { open: boolean; className?: string }) {
  return <Sf className={`${className} transition-transform duration-200 ${open ? "rotate-90" : ""}`} d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" />
}
export function IconPencil({ className = "w-4 h-4" }: IC) {
  return <S className={className} d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
}
export function IconPlay({ className = "w-4 h-4" }: IC) {
  return <S className={className} d="M6.3 2.841A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
}
export function IconEye({ className = "w-4 h-4" }: IC) {
  return <svg className={className} viewBox="0 0 20 20" fill="currentColor"><path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" /><path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" /></svg>
}
export function IconCheck({ className = "w-4 h-4" }: IC) {
  return <Sf className={className} d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" />
}
export function IconArchive({ className = "w-4 h-4" }: IC) {
  return <svg className={className} viewBox="0 0 20 20" fill="currentColor"><path d="M2 3a1 1 0 00-1 1v1a1 1 0 001 1h16a1 1 0 001-1V4a1 1 0 00-1-1H2z" /><path fillRule="evenodd" d="M2 7.5h16l-.811 7.71a2 2 0 01-1.99 1.79H4.802a2 2 0 01-1.99-1.79L2 7.5zM7 11a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1z" clipRule="evenodd" /></svg>
}
export function IconCalendar({ className = "w-4 h-4" }: IC) {
  return <Sf className={className} d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z" />
}
export function IconGauge({ className = "w-4 h-4" }: IC) {
  return <Sf className={className} d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-11.25a.75.75 0 00-1.5 0v2.5c0 .414.336.75.75.75h2.5a.75.75 0 000-1.5h-1.75v-1.75z" />
}
export function IconArrowRight({ className = "w-4 h-4" }: IC) {
  return <Sf className={className} d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" />
}
export function IconClipboard({ className = "w-4 h-4" }: IC) {
  return <Sf className={className} d="M13.887 3.182c.396.037.79.08 1.183.128C16.194 3.45 17 4.414 17 5.517V16.75A2.25 2.25 0 0114.75 19h-9.5A2.25 2.25 0 013 16.75V5.517c0-1.103.806-2.068 1.93-2.207.393-.048.787-.09 1.183-.128A3.001 3.001 0 019 1h2c1.373 0 2.531.923 2.887 2.182zM7.5 4A1.5 1.5 0 019 2.5h2A1.5 1.5 0 0112.5 4v.5h-5V4z" />
}
export function IconScale({ className = "w-3.5 h-3.5" }: IC) {
  return <Sf className={className} d="M10 2a.75.75 0 01.75.75v.258a33.186 33.186 0 016.668.83.75.75 0 01-.336 1.461 31.28 31.28 0 00-1.103-.232l1.702 7.545a.75.75 0 01-.387.832A4.981 4.981 0 0114 14c-1.09 0-2.077-.363-2.884-.956L10 2.75A.75.75 0 0110 2zM5 14c-1.09 0-2.077-.363-2.884-.956L3.82 6.591A31.28 31.28 0 002.72 6.36a.75.75 0 01-.337-1.462 33.186 33.186 0 016.668-.83V2.75a.75.75 0 011.5 0v.258c.22.012.44.027.66.044l1.702 7.545a.75.75 0 01-.387.832A4.981 4.981 0 015 14z" />
}
export function IconPerson({ className = "w-3.5 h-3.5" }: IC) {
  return <S className={className} d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
}
export function IconClock({ className = "w-3.5 h-3.5" }: IC) {
  return <Sf className={className} d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" />
}
export function IconTrash({ className = "w-4 h-4" }: IC) {
  return <Sf className={className} d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 3.68V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" />
}
export function IconPlusCircle({ className = "w-4 h-4" }: IC) {
  return <Sf className={className} d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-11.25a.75.75 0 00-1.5 0v2.5h-2.5a.75.75 0 000 1.5h2.5v2.5a.75.75 0 001.5 0v-2.5h2.5a.75.75 0 000-1.5h-2.5v-2.5z" />
}
export function IconChatBubble({ className = "w-4 h-4" }: IC) {
  return <Sf className={className} d="M3.43 2.524A41.29 41.29 0 0110 2c2.236 0 4.43.18 6.57.524 1.437.231 2.43 1.49 2.43 2.902v5.148c0 1.413-.993 2.67-2.43 2.902a41.102 41.102 0 01-3.55.414c-.28.02-.521.18-.643.413l-1.712 3.293a.75.75 0 01-1.33 0l-1.713-3.293a.783.783 0 00-.642-.413 41.108 41.108 0 01-3.55-.414C1.993 13.245 1 11.986 1 10.574V5.426c0-1.413.993-2.67 2.43-2.902z" />
}
export function IconEditPencilAlt({ className = "w-4 h-4" }: IC) {
  return <svg className={className} viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>
}

/* Task status icons */
export function TaskStatusIcon({ status, className = "w-5 h-5" }: { status: string; className?: string }) {
  if (status === "done") {
    return (
      <svg className={className} viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
      </svg>
    )
  }
  if (status === "in_progress") {
    return (
      <svg className={className} viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M2 10a8 8 0 1116 0 8 8 0 01-16 0zm6.39-2.908a.75.75 0 01.766.027l3.5 2.25a.75.75 0 010 1.262l-3.5 2.25A.75.75 0 018 12.25v-4.5a.75.75 0 01.39-.658z" clipRule="evenodd" />
      </svg>
    )
  }
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm0-2a6 6 0 100-12 6 6 0 000 12z" clipRule="evenodd" />
    </svg>
  )
}

/* Sprint status icon */
export function StatusIcon({ status }: { status: string }) {
  const cls = "w-3.5 h-3.5"
  switch (status) {
    case "planning": return <IconPencil className={cls} />
    case "active": return <IconPlay className={cls} />
    case "review": return <IconEye className={cls} />
    case "done": return <IconCheck className={cls} />
    case "archived": return <IconArchive className={cls} />
    default: return null
  }
}

export const statusBadge: Record<string, string> = {
  planning: "bg-amber-100 text-amber-800 border border-amber-200",
  active: "bg-blue-100 text-blue-800 border border-blue-200",
  review: "bg-violet-100 text-violet-800 border border-violet-200",
  done: "bg-emerald-100 text-emerald-800 border border-emerald-200",
  archived: "bg-slate-100 text-slate-600 border border-slate-200",
}

export const eventColorBg: Record<string, string> = {
  blue: "bg-blue-50 text-blue-700 border-blue-200",
  green: "bg-green-50 text-green-700 border-green-200",
  red: "bg-red-50 text-red-700 border-red-200",
  yellow: "bg-yellow-50 text-yellow-700 border-yellow-200",
  purple: "bg-purple-50 text-purple-700 border-purple-200",
  gray: "bg-gray-50 text-gray-700 border-gray-200",
}
