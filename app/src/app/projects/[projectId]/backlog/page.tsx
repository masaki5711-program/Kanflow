"use client"

import { useEffect, useMemo, useState, useCallback } from "react"
import { useParams } from "next/navigation"
import { useSession } from "next-auth/react"
import { useLanguage } from "@/lib/language-context"
import { useConfirm } from "@/components/confirm-dialog"
import { HelpTooltip } from "@/components/help-tooltip"
import PbiDetailModal from "@/components/pbi-detail-modal"
import { BilingualButton } from "@/components/bilingual-button"
import { AIResultModal } from "@/components/ai-result-modal"
import { streamTranslate } from "@/lib/streaming-translate"
import { getPointScale, formatPointUnit } from "@/lib/i18n"

interface ProductGoal {
  id: string
  title: string
  description: string | null
}

interface IceboxItem {
  id: string
  displayId: number
  request: string
  background: string | null
  author: string
  status: string
}

interface BacklogItem {
  id: string
  displayId: number
  initiative: string | null
  epic: string | null
  userStory: string | null
  acceptanceCriteria: string | null
  workloadScore: number
  status: string
  assignedPo: string | null
  sortOrder: number
  completedAt: string | null
  iceboxItemId: string | null
  iceboxItem: { id: string; request: string } | null
  productGoalId: string | null
  productGoal: { id: string; title: string } | null
  /** Planning/active sprints already working on this PBI (one row per sprint task). */
  sprintItems?: { sprint: { id: string; sprintName: string; status: string } }[]
}

// --- SVG Icon Components (Heroicons-style, 20x20 viewBox, filled) ---
type IP = { className?: string }
const Svg = ({ c, children }: { c: string; children: React.ReactNode }) => (
  <svg className={c} viewBox="0 0 20 20" fill="currentColor">{children}</svg>
)
function IconClipboardList({ className = "w-5 h-5" }: IP) {
  return <Svg c={className}><path d="M5.5 3A2.5 2.5 0 003 5.5v9A2.5 2.5 0 005.5 17h9a2.5 2.5 0 002.5-2.5v-9A2.5 2.5 0 0014.5 3h-1.06a2.5 2.5 0 00-4.88 0H5.5zM10 2.5a1 1 0 00-1 1h2a1 1 0 00-1-1zM6.5 8a.5.5 0 01.5-.5h6a.5.5 0 010 1H7a.5.5 0 01-.5-.5zm0 3a.5.5 0 01.5-.5h6a.5.5 0 010 1H7a.5.5 0 01-.5-.5zm0 3a.5.5 0 01.5-.5h4a.5.5 0 010 1H7a.5.5 0 01-.5-.5z" /></Svg>
}
function IconPlus({ className = "w-4 h-4" }: IP) {
  return <Svg c={className}><path d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" /></Svg>
}
function IconSearch({ className = "w-4 h-4" }: IP) {
  return <Svg c={className}><path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" /></Svg>
}
function IconCheckCircle({ className = "w-5 h-5" }: IP) {
  return <Svg c={className}><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" /></Svg>
}
function IconClock({ className = "w-5 h-5" }: IP) {
  return <Svg c={className}><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd" /></Svg>
}
function IconArchive({ className = "w-5 h-5" }: IP) {
  return <Svg c={className}><path d="M2 3a1 1 0 00-1 1v1a1 1 0 001 1h16a1 1 0 001-1V4a1 1 0 00-1-1H2z" /><path fillRule="evenodd" d="M2 7.5h16l-.811 7.71a2 2 0 01-1.99 1.79H4.802a2 2 0 01-1.99-1.79L2 7.5zM7 11a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1z" clipRule="evenodd" /></Svg>
}
function IconChevronUp({ className = "w-4 h-4" }: IP) {
  return <Svg c={className}><path fillRule="evenodd" d="M14.77 12.79a.75.75 0 01-1.06-.02L10 8.832 6.29 12.77a.75.75 0 11-1.08-1.04l4.25-4.5a.75.75 0 011.08 0l4.25 4.5a.75.75 0 01-.02 1.06z" clipRule="evenodd" /></Svg>
}
function IconChevronDown({ className = "w-4 h-4" }: IP) {
  return <Svg c={className}><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" /></Svg>
}
function IconPencil({ className = "w-4 h-4" }: IP) {
  return <Svg c={className}><path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" /></Svg>
}
function IconTrash({ className = "w-4 h-4" }: IP) {
  return <Svg c={className}><path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 01.7.797l-.5 6a.75.75 0 01-1.497-.124l.5-6a.75.75 0 01.797-.672zm3.637.797a.75.75 0 10-1.497-.124l-.5 6a.75.75 0 101.497.124l.5-6z" clipRule="evenodd" /></Svg>
}
function IconTag({ className = "w-3.5 h-3.5" }: IP) {
  return <Svg c={className}><path fillRule="evenodd" d="M5.5 3A2.5 2.5 0 003 5.5v2.879a2.5 2.5 0 00.732 1.767l6.5 6.5a2.5 2.5 0 003.536 0l2.878-2.878a2.5 2.5 0 000-3.536l-6.5-6.5A2.5 2.5 0 008.38 3H5.5zM6 7a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></Svg>
}
function IconTarget({ className = "w-3.5 h-3.5" }: IP) {
  return <Svg c={className}><path fillRule="evenodd" d="M10 1a9 9 0 100 18 9 9 0 000-18zm0 2a7 7 0 100 14 7 7 0 000-14zm0 2a5 5 0 100 10 5 5 0 000-10zm0 2a3 3 0 100 6 3 3 0 000-6zm0 2a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" /></Svg>
}
function IconLightbulb({ className = "w-3.5 h-3.5" }: IP) {
  return <Svg c={className}><path d="M10 1a6 6 0 00-3.815 10.631C7.237 12.5 8 13.443 8 14.456v.044a2 2 0 002 2 2 2 0 002-2v-.044c0-1.013.762-1.957 1.815-2.825A6 6 0 0010 1zM8 18a2 2 0 104 0H8z" /></Svg>
}
function IconPerson({ className = "w-3.5 h-3.5" }: IP) {
  return <Svg c={className}><path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" /></Svg>
}
function IconSparkle({ className = "w-3.5 h-3.5" }: IP) {
  return <Svg c={className}><path d="M10 1l2.39 5.477L18 8.163l-4.045 3.7L14.82 18 10 14.902 5.18 18l.865-6.138L2 8.163l5.61-1.686L10 1z" /></Svg>
}
function IconScale({ className = "w-3.5 h-3.5" }: IP) {
  return <Svg c={className}><path fillRule="evenodd" d="M10 2a.75.75 0 01.75.75v.258a33.186 33.186 0 016.668.83.75.75 0 01-.336 1.461 31.28 31.28 0 00-1.103-.232l1.702 7.545a.75.75 0 01-.387.832A4.981 4.981 0 0114 14a4.981 4.981 0 01-3.294-.556.75.75 0 01-.387-.832l1.77-7.849a31.743 31.743 0 00-1.339-.084v11.571h2.5a.75.75 0 010 1.5h-6.5a.75.75 0 010-1.5h2.5V4.681a33.3 33.3 0 00-1.282.078l1.77 7.848a.75.75 0 01-.387.833A4.981 4.981 0 016 14a4.981 4.981 0 01-3.294-.556.75.75 0 01-.387-.832l1.702-7.545c-.372.06-.742.126-1.11.198a.75.75 0 01-.317-1.466 33.186 33.186 0 016.656-.825V2.75A.75.75 0 0110 2zM3.765 11.5L6 1.574 8.235 11.5H3.765zm8 0L14 1.574 16.235 11.5h-4.47z" clipRule="evenodd" /></Svg>
}
function IconChecklist({ className = "w-3.5 h-3.5" }: IP) {
  return <Svg c={className}><path fillRule="evenodd" d="M6 4.75A.75.75 0 016.75 4h10.5a.75.75 0 010 1.5H6.75A.75.75 0 016 4.75zM6 10a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H6.75A.75.75 0 016 10zm0 5.25a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H6.75a.75.75 0 01-.75-.75zM1.99 4.47a.75.75 0 011.06 0l.97.97 1.97-1.97a.75.75 0 011.06 1.06l-2.5 2.5a.75.75 0 01-1.06 0l-1.5-1.5a.75.75 0 010-1.06zm0 5.25a.75.75 0 011.06 0l.97.97 1.97-1.97a.75.75 0 111.06 1.06l-2.5 2.5a.75.75 0 01-1.06 0l-1.5-1.5a.75.75 0 010-1.06zm0 5.25a.75.75 0 011.06 0l.97.97 1.97-1.97a.75.75 0 111.06 1.06l-2.5 2.5a.75.75 0 01-1.06 0l-1.5-1.5a.75.75 0 010-1.06z" clipRule="evenodd" /></Svg>
}
function IconCalendar({ className = "w-3.5 h-3.5" }: IP) {
  return <Svg c={className}><path fillRule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z" clipRule="evenodd" /></Svg>
}

// --- User story format helpers ---
// --- Section config ---
const SECTION_CONFIG = {
  ready: { icon: IconCheckCircle, color: "emerald", border: "border-l-emerald-500", iconColor: "text-emerald-600", badgeBg: "bg-emerald-50", badgeText: "text-emerald-700" },
  not_ready: { icon: IconClock, color: "amber", border: "border-l-amber-500", iconColor: "text-amber-500", badgeBg: "bg-amber-50", badgeText: "text-amber-700" },
  completed: { icon: IconArchive, color: "slate", border: "border-l-slate-400", iconColor: "text-slate-500", badgeBg: "bg-slate-100", badgeText: "text-slate-600" },
} as const

export default function BacklogPage() {
  const params = useParams()
  const projectId = params.projectId as string
  const { t, pt, language } = useLanguage()
  const confirm = useConfirm()
  const { data: session } = useSession()
  const [myRole, setMyRole] = useState<string | null>(null)
  // System admins bypass project membership and get PO-equivalent edit rights
  // (matches the requireProjectMember admin synthesis on the server side).
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "admin"
  const canEdit = isAdmin || myRole === "po" || myRole === "sm"
  const [detailPbiId, setDetailPbiId] = useState<string | null>(null)
  const [investPbiId, setInvestPbiId] = useState<string | null>(null)
  const [pointUnit, setPointUnit] = useState<string>("SP")
  const pointScale = getPointScale(pointUnit)
  const pointUnitLabel = formatPointUnit(pointUnit, t)

  const [readyItems, setReadyItems] = useState<BacklogItem[]>([])
  const [notReadyItems, setNotReadyItems] = useState<BacklogItem[]>([])
  const [completedItems, setCompletedItems] = useState<BacklogItem[]>([])
  const [totalWorkload, setTotalWorkload] = useState(0)
  const [initialLoading, setInitialLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [iceboxItems, setIceboxItems] = useState<IceboxItem[]>([])
  // "Which Icebox items are already referenced by another PBI?" — surfaced
  // both as ⚠ tags on the dropdown and as a confirm-before-reuse dialog.
  // The current PBI (in edit mode) is intentionally excluded from the map
  // so the user doesn't get warned about self-references.
  const iceboxUsageMap = useMemo(() => {
    const map = new Map<string, { displayId: number; label: string }>()
    for (const list of [readyItems, notReadyItems, completedItems]) {
      for (const pbi of list) {
        if (!pbi.iceboxItemId) continue
        if (editingId === pbi.id) continue
        const label = pbi.initiative || pbi.userStory || `#${pbi.displayId}`
        map.set(pbi.iceboxItemId, { displayId: pbi.displayId, label })
      }
    }
    return map
  }, [readyItems, notReadyItems, completedItems, editingId])
  const [productGoals, setProductGoals] = useState<ProductGoal[]>([])
  const [showCompleted, setShowCompleted] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  const [form, setForm] = useState({
    initiative: "",
    epic: "",
    userStory: "",
    acceptanceCriteria: "",
    workloadScore: 0,
    status: "not_ready" as "ready" | "not_ready" | "completed",
    iceboxItemId: "" as string,
    productGoalId: "" as string,
  })

  type BilingualField = "initiative" | "epic" | "userStory" | "acceptanceCriteria"
  const [translating, setTranslating] = useState<Record<BilingualField, boolean>>({
    initiative: false,
    epic: false,
    userStory: false,
    acceptanceCriteria: false,
  })

  async function handleBilingualize(field: BilingualField) {
    const current = form[field]
    if (!current.trim() || translating[field]) return
    setTranslating((s) => ({ ...s, [field]: true }))
    try {
      // Stream the result into the field as tokens arrive (typing effect).
      await streamTranslate(current.trim(), (acc) => {
        setForm((f) => ({ ...f, [field]: acc }))
      })
    } catch {
      alert(t.bilingualizeFailed)
    } finally {
      setTranslating((s) => ({ ...s, [field]: false }))
    }
  }

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/backlog`)
      if (res.ok) {
        const data = await res.json()
        setReadyItems(data.readyItems)
        setNotReadyItems(data.notReadyItems)
        setCompletedItems(data.completedItems ?? [])
        setTotalWorkload(data.totalWorkload)
      }
    } finally {
      setInitialLoading(false)
    }
  }, [projectId])

  const fetchIceboxItems = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/icebox`)
    if (res.ok) {
      const data = await res.json()
      setIceboxItems([...data.unreviewed, ...data.reviewed])
    }
  }, [projectId])

  const fetchProductGoals = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/goals`)
    if (res.ok) {
      const data = await res.json()
      setProductGoals(data)
    }
  }, [projectId])

  useEffect(() => {
    fetchItems()
    fetchIceboxItems()
    fetchProductGoals()
  }, [fetchItems, fetchIceboxItems, fetchProductGoals])

  // Pre-fill form from a generated PBI draft (passed via sessionStorage from Icebox).
  useEffect(() => {
    if (typeof window === "undefined") return
    if (!new URLSearchParams(window.location.search).get("fromAiDraft")) return
    const key = `kanflow:pbiDraft:${projectId}`
    const raw = sessionStorage.getItem(key)
    if (!raw) return
    try {
      const draft = JSON.parse(raw) as {
        initiative?: string
        epic?: string
        userStory?: string
        acceptanceCriteria?: string
        workloadScore?: number
        iceboxItemId?: string
      }
      setForm((prev) => ({
        ...prev,
        initiative: draft.initiative ?? "",
        epic: draft.epic ?? "",
        userStory: draft.userStory ?? "",
        acceptanceCriteria: draft.acceptanceCriteria ?? "",
        workloadScore: draft.workloadScore ?? 0,
        iceboxItemId: draft.iceboxItemId ?? "",
      }))
      setShowForm(true)
    } catch { /* ignore */ }
    sessionStorage.removeItem(key)
    // Clean the URL
    const url = new URL(window.location.href)
    url.searchParams.delete("fromAiDraft")
    window.history.replaceState({}, "", url.toString())
  }, [projectId])

  // Determine current user's role in this project. Only PO can edit PBIs.
  useEffect(() => {
    if (!session?.user?.id) return
    const uid = session.user.id
    fetch(`/api/projects/${projectId}/members`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((members: { role: string; user: { id: string } }[]) => {
        const me = members.find((m) => m.user.id === uid)
        setMyRole(me?.role ?? null)
      })
      .catch(() => setMyRole(null))
  }, [projectId, session?.user?.id])

  // Load project's point unit for the workload score scale.
  useEffect(() => {
    fetch(`/api/projects/${projectId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((p: { pointUnit?: string }) => setPointUnit(p.pointUnit ?? "SP"))
      .catch(() => {})
  }, [projectId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const url = editingId
      ? `/api/projects/${projectId}/backlog/${editingId}`
      : `/api/projects/${projectId}/backlog`
    const method = editingId ? "PATCH" : "POST"
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initiative: form.initiative || undefined,
          epic: form.epic || undefined,
          userStory: form.userStory || undefined,
          acceptanceCriteria: form.acceptanceCriteria || undefined,
          workloadScore: form.workloadScore,
          status: form.status,
          iceboxItemId: form.iceboxItemId || undefined,
          productGoalId: form.productGoalId || null,
        }),
      })
      if (res.ok) {
        resetForm()
        fetchItems()
      } else {
        const err = await res.json().catch(() => null)
        alert(`${t.error}: ${err?.error || res.statusText}`)
      }
    } catch {
      alert(t.error)
    }
  }

  function resetForm() {
    setShowForm(false)
    setEditingId(null)
    setForm({
      initiative: "", epic: "", userStory: "",
      acceptanceCriteria: "", workloadScore: 0, status: "not_ready",
      iceboxItemId: "", productGoalId: "",
    })
  }

  function startEdit(item: BacklogItem) {
    setEditingId(item.id)
    setForm({
      initiative: item.initiative ?? "", epic: item.epic ?? "",
      userStory: item.userStory ?? "",
      acceptanceCriteria: item.acceptanceCriteria ?? "",
      workloadScore: item.workloadScore,
      status: item.status as "ready" | "not_ready" | "completed",
      iceboxItemId: item.iceboxItemId ?? "", productGoalId: item.productGoalId ?? "",
    })
    setShowForm(true)
  }

  async function handleSelectIcebox(iceboxId: string) {
    if (!iceboxId) {
      setForm((prev) => ({ ...prev, iceboxItemId: "" }))
      return
    }
    const icebox = iceboxItems.find((i) => i.id === iceboxId)
    if (!icebox) {
      setForm((prev) => ({ ...prev, iceboxItemId: "" }))
      return
    }
    // Warn when a different PBI already references this Icebox item — the
    // user may have missed the ⚠ tag in the dropdown, or picked it via
    // keyboard. Ask before proceeding.
    const used = iceboxUsageMap.get(iceboxId)
    if (used) {
      const ok = await confirm({
        title: t.backlogIceboxAlreadyUsedTitle,
        message: `${t.backlogIceboxAlreadyUsedBody}\n\n→ #${used.displayId} ${used.label}`,
        confirmLabel: t.backlogIceboxReuseAnyway,
        cancelLabel: t.cancel,
        variant: "danger",
      })
      if (!ok) {
        // Reset the dropdown to "no selection" so the user can pick a different one.
        setForm((prev) => ({ ...prev, iceboxItemId: "" }))
        return
      }
    }
    setForm((prev) => ({ ...prev, iceboxItemId: iceboxId, userStory: prev.userStory || icebox.request }))
  }

  async function handleDelete(itemId: string) {
    if (!await confirm({ message: t.iceboxDeleteConfirm, confirmLabel: t.delete, cancelLabel: t.cancel, variant: "danger" })) return
    try {
      const res = await fetch(`/api/projects/${projectId}/backlog/${itemId}`, { method: "DELETE" })
      if (res.ok) fetchItems()
      else alert(`${t.error}: ${res.statusText}`)
    } catch {
      alert(t.error)
    }
  }

  async function handleStatusChange(itemId: string, newStatus: string) {
    const res = await fetch(`/api/projects/${projectId}/backlog/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    })
    if (res.ok) fetchItems()
  }

  async function moveUp(items: BacklogItem[], index: number) {
    if (index === 0) return
    const newItems = [...items]
    const temp = newItems[index]
    newItems[index] = newItems[index - 1]
    newItems[index - 1] = temp
    const orderedIds = newItems.map((i) => i.id)
    await fetch(`/api/projects/${projectId}/backlog/reorder`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds }),
    })
    fetchItems()
  }

  async function moveDown(items: BacklogItem[], index: number) {
    if (index === items.length - 1) return
    const newItems = [...items]
    const temp = newItems[index]
    newItems[index] = newItems[index + 1]
    newItems[index + 1] = temp
    const orderedIds = newItems.map((i) => i.id)
    await fetch(`/api/projects/${projectId}/backlog/reorder`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds }),
    })
    fetchItems()
  }

  function renderUserStory(story: string | null) {
    if (!story) return <span className="text-gray-400 text-xs">{t.sprintNotEntered}</span>
    return (
      <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">{story}</p>
    )
  }

  function renderItemCard(item: BacklogItem, index: number, items: BacklogItem[], sectionStatus: "ready" | "not_ready" | "completed") {
    const cfg = SECTION_CONFIG[sectionStatus]
    // Ready items already picked up by a planning/active sprint get a blue
    // tint + badge so users can tell adopted vs waiting at a glance.
    // Dedupe: sprintItems has one row per sprint task, not per sprint.
    const inSprints = sectionStatus === "ready"
      ? Array.from(new Map((item.sprintItems ?? []).map((si) => [si.sprint.id, si.sprint])).values())
      : []
    const isInSprint = inSprints.length > 0
    return (
      <div
        key={item.id}
        className={`rounded-lg border border-l-4 p-4 hover:shadow-md transition-shadow ${
          isInSprint
            ? "bg-blue-50/60 border-blue-200 border-l-blue-500"
            : `bg-white border-gray-100 ${cfg.border}`
        } ${sectionStatus === "completed" ? "opacity-60" : ""}`}
      >
        <div className="flex items-start gap-3">
          {sectionStatus !== "completed" && (
            <div className="flex flex-col gap-0.5 pt-0.5">
              <button
                onClick={() => moveUp(items, index)}
                disabled={index === 0}
                className="p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 disabled:opacity-20 disabled:hover:bg-transparent transition-colors"
                title="Move up"
              >
                <IconChevronUp className="w-4 h-4" />
              </button>
              <button
                onClick={() => moveDown(items, index)}
                disabled={index === items.length - 1}
                className="p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 disabled:opacity-20 disabled:hover:bg-transparent transition-colors"
                title="Move down"
              >
                <IconChevronDown className="w-4 h-4" />
              </button>
            </div>
          )}

          <span className="text-xs font-mono bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded mt-0.5 flex-shrink-0">
            #{item.displayId}
          </span>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 mb-1">
              {item.initiative || t.sprintNotEntered}
            </p>

            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              {isInSprint && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-300 px-2 py-0.5 rounded-full">
                  ⚡ {t.backlogInSprintBadge}
                  <span className="font-normal text-blue-700">
                    ({inSprints.map((s) => s.sprintName).join(", ")})
                  </span>
                </span>
              )}
              {item.epic && (
                <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                  <IconTag className="w-3 h-3" />
                  {item.epic}
                </span>
              )}
              {item.productGoal && (
                <span className="inline-flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">
                  <IconTarget className="w-3 h-3" />
                  {item.productGoal.title}
                </span>
              )}
              {item.iceboxItem && (
                <span className="inline-flex items-center gap-1 text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">
                  <IconLightbulb className="w-3 h-3" />
                  {item.iceboxItem.request.slice(0, 30)}
                  {item.iceboxItem.request.length > 30 ? "..." : ""}
                </span>
              )}
            </div>

            {renderUserStory(item.userStory)}

            {sectionStatus === "completed" && item.completedAt && (
              <div className="flex items-center gap-1 text-xs text-green-600 mt-1.5">
                <IconCalendar className="w-3 h-3" />
                {t.backlogCompletedDate}: {item.completedAt.slice(0, 10).replace(/-/g, "/")}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="inline-flex items-center gap-1 text-xs font-medium bg-orange-50 text-orange-700 px-2.5 py-1 rounded-full">
              <IconScale className="w-3 h-3" />
              {item.workloadScore}
            </span>

            <button
              onClick={() => setInvestPbiId(item.id)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-purple-700 border border-purple-300 hover:bg-purple-50 transition-colors text-[11px] font-medium"
              title={t.aiInvestReview}
            >
              <span aria-hidden>🤖</span>
              {t.aiInvestReview}
            </button>

            {canEdit && sectionStatus === "not_ready" && (
              <button
                onClick={() => handleStatusChange(item.id, "ready")}
                className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                title={t.backlogMoveToReady}
              >
                <IconCheckCircle className="w-4 h-4" />
              </button>
            )}
            {canEdit && sectionStatus === "ready" && (
              <>
                <button
                  onClick={() => handleStatusChange(item.id, "not_ready")}
                  className="p-1.5 rounded-lg text-gray-400 hover:bg-amber-50 hover:text-amber-600 transition-colors"
                  title={t.backlogMoveToNotReady}
                >
                  <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9.707 14.707a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 1.414L7.414 9H15a1 1 0 110 2H7.414l2.293 2.293a1 1 0 010 1.414z" clipRule="evenodd"/>
                  </svg>
                </button>
                <button
                  onClick={() => handleStatusChange(item.id, "completed")}
                  className="p-1.5 rounded-lg text-green-500 hover:bg-green-50 hover:text-green-700 transition-colors"
                  title={t.backlogMoveToCompleted}
                >
                  <IconCheckCircle className="w-4 h-4" />
                </button>
              </>
            )}
            {canEdit && sectionStatus === "completed" && (
              <button
                onClick={() => handleStatusChange(item.id, "ready")}
                className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                title={t.backlogReturnToReady}
              >
                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M9.707 14.707a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 1.414L7.414 9H15a1 1 0 110 2H7.414l2.293 2.293a1 1 0 010 1.414z" clipRule="evenodd"/>
                </svg>
              </button>
            )}
            {/* Edit/delete: PO only. Non-PO members see a view-only button. */}
            {canEdit && sectionStatus !== "completed" && (
              <>
                <button
                  onClick={() => startEdit(item)}
                  className="p-1.5 rounded-lg text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                  title={t.edit}
                >
                  <IconPencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(item.id)}
                  className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                  title={t.delete}
                >
                  <IconTrash className="w-4 h-4" />
                </button>
              </>
            )}
            {!canEdit && (
              <button
                onClick={() => setDetailPbiId(item.id)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                title={t.view ?? "詳細"}
              >
                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
                  <path fillRule="evenodd" d="M.664 10.59a1.65 1.65 0 010-1.186A10 10 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10 10 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  function renderSection(
    title: string,
    items: BacklogItem[],
    showWorkloadTotal: boolean,
    sectionStatus: "ready" | "not_ready" | "completed"
  ) {
    const cfg = SECTION_CONFIG[sectionStatus]
    const SectionIcon = cfg.icon
    const sectionWorkload = items.reduce((sum, i) => sum + i.workloadScore, 0)

    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className={`${cfg.border} border-l-4 px-6 py-4`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <SectionIcon className={`w-5 h-5 ${cfg.iconColor}`} />
              <h2 className="text-base font-semibold text-gray-900">{title}</h2>
              <span className={`text-xs font-medium ${cfg.badgeBg} ${cfg.badgeText} px-2 py-0.5 rounded-full`}>
                {items.length}{t.items}
              </span>
              {sectionStatus === "ready" && (
                <HelpTooltip content={t.backlogReadyHint} ariaLabel="Ready" side="right" />
              )}
              {sectionStatus === "not_ready" && (
                <HelpTooltip content={t.backlogNotReadyHint} ariaLabel="Not Ready" side="right" />
              )}
              {sectionStatus === "completed" && (
                <HelpTooltip content={t.backlogCompletedHint} ariaLabel="Completed" side="right" />
              )}
            </div>
            {showWorkloadTotal && (
              <span className="inline-flex items-center gap-1 text-xs font-medium bg-blue-50 text-blue-700 px-3 py-1 rounded-full">
                <IconScale className="w-3.5 h-3.5" />
                {t.reportTotalWorkload}: {sectionWorkload}
              </span>
            )}
          </div>
        </div>
        <div className="p-4 space-y-2">
          {items.map((item, index) => renderItemCard(item, index, items, sectionStatus))}
          {items.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-6">{t.iceboxNoItems}</p>
          )}
        </div>
      </div>
    )
  }

  if (initialLoading) {
    return <div className="text-center py-16 text-gray-500">{t.loading}</div>
  }

  const q = searchQuery.toLowerCase().trim()
  const filterItems = (list: BacklogItem[]) =>
    q
      ? list.filter(
          (item) =>
            (item.initiative ?? "").toLowerCase().includes(q) ||
            (item.epic ?? "").toLowerCase().includes(q) ||
            (item.userStory ?? "").toLowerCase().includes(q) ||
            (item.acceptanceCriteria ?? "").toLowerCase().includes(q) ||
            String(item.displayId).includes(q)
        )
      : list
  const filteredReady = filterItems(readyItems)
  const filteredNotReady = filterItems(notReadyItems)
  const filteredCompleted = filterItems(completedItems)

  return (
    <div className="max-w-5xl mx-auto">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <IconClipboardList className="w-7 h-7 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">{pt.backlogTitle}</h1>
          <span className="inline-flex items-center gap-1 text-xs font-medium bg-blue-50 text-blue-700 px-3 py-1 rounded-full">
            <IconScale className="w-3.5 h-3.5" />
            {t.reportTotalWorkload}: {totalWorkload}
          </span>
        </div>
        {canEdit && (
          <button
            onClick={() => { resetForm(); setShowForm(true) }}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 text-sm font-medium shadow-sm transition-all"
          >
            <IconPlus className="w-4 h-4" />
            {t.backlogAddItem}
          </button>
        )}
      </div>

      {/* Create/Edit Form */}
      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
          <div className="h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
          <div className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-5">
              {canEdit ? (editingId ? t.edit : t.backlogAddItem) : (t.view ?? "詳細")}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-5">
            <fieldset disabled={!canEdit} className="space-y-5 contents">
              <div className="grid grid-cols-2 gap-4">
                {/* IceBox selection */}
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
                    <IconLightbulb className="w-3.5 h-3.5 text-purple-500" />
                    {pt.navIcebox} ({pt.iceboxRequest})
                  </label>
                  <select
                    value={form.iceboxItemId}
                    onChange={(e) => handleSelectIcebox(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
                  >
                    <option value="">-- {t.cancel} --</option>
                    {iceboxItems.map((item) => {
                      const used = iceboxUsageMap.get(item.id)
                      const prefix = used ? `⚠ [${t.backlogIceboxAlreadyUsedTag}] ` : ""
                      const suffix = used ? ` → PBI #${used.displayId}` : ""
                      return (
                        <option key={item.id} value={item.id}>
                          {prefix}#{item.displayId} - {item.request.slice(0, 60)}{item.request.length > 60 ? "..." : ""} ({item.author}){suffix}
                        </option>
                      )
                    })}
                  </select>
                  {form.iceboxItemId && iceboxUsageMap.has(form.iceboxItemId) && (
                    <p className="mt-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                      ⚠ {t.backlogIceboxAlreadyUsedTitle}
                    </p>
                  )}
                </div>
                {/* Product Goal */}
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
                    <IconTarget className="w-3.5 h-3.5 text-indigo-500" />
                    {t.dashboardProductGoals}
                  </label>
                  <select
                    value={form.productGoalId}
                    onChange={(e) => setForm({ ...form, productGoalId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
                  >
                    <option value="">-- {t.eventNone} --</option>
                    {productGoals.map((goal) => (
                      <option key={goal.id} value={goal.id}>{goal.title}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                      <IconTag className="w-3.5 h-3.5 text-gray-500" />
                      {pt.backlogInitiative}
                      <HelpTooltip content={pt.backlogInitiativeHelp} ariaLabel={pt.backlogInitiative} side="right" />
                    </label>
                    <BilingualButton
                      onClick={() => handleBilingualize("initiative")}
                      disabled={!form.initiative.trim()}
                      translating={translating.initiative}
                    />
                  </div>
                  <input
                    type="text"
                    value={form.initiative}
                    onChange={(e) => setForm({ ...form, initiative: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                      <IconTag className="w-3.5 h-3.5 text-gray-500" />
                      {pt.backlogEpic}
                      <HelpTooltip content={pt.backlogEpicHelp} ariaLabel={pt.backlogEpic} side="right" />
                    </label>
                    <BilingualButton
                      onClick={() => handleBilingualize("epic")}
                      disabled={!form.epic.trim()}
                      translating={translating.epic}
                    />
                  </div>
                  <input
                    type="text"
                    value={form.epic}
                    onChange={(e) => setForm({ ...form, epic: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* User Story — single freeform textarea with format guidance */}
              <div className="border-2 border-blue-200 rounded-xl p-5 bg-blue-50/30">
                <div className="flex items-center justify-between mb-2">
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                    <IconPerson className="w-4 h-4 text-blue-600" />
                    {pt.backlogUserStory}
                  </label>
                  <BilingualButton
                    onClick={() => handleBilingualize("userStory")}
                    disabled={!form.userStory.trim()}
                    translating={translating.userStory}
                  />
                </div>
                <div className="bg-white border border-blue-100 rounded-lg px-3 py-2 mb-3 text-xs text-gray-600 leading-relaxed">
                  <p className="font-semibold text-blue-700 mb-1">📝 記入ルール</p>
                  <p className="font-mono text-[11px] text-gray-700 bg-blue-50/40 px-2 py-1.5 rounded mb-1.5">
                    ＜{pt.backlogWho}＞として、＜{pt.backlogWhat}＞したい。それは＜{pt.backlogWhy}＞だからだ。
                  </p>
                  <p className="text-gray-500 text-[11px]">
                    例：「<span className="text-blue-600">プロジェクトマネージャー</span>として、<span className="text-green-600">チームの進捗をリアルタイムで確認</span>したい。それは<span className="text-orange-600">遅延リスクを早期に発見できる</span>からだ。」
                  </p>
                </div>
                <textarea
                  value={form.userStory}
                  onChange={(e) => setForm({ ...form, userStory: e.target.value })}
                  placeholder={t.backlogUserStoryPlaceholder}
                  rows={6}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white leading-relaxed resize-y"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                    <IconChecklist className="w-3.5 h-3.5 text-gray-500" />
                    {pt.backlogAcceptanceCriteria}
                  </label>
                  <BilingualButton
                    onClick={() => handleBilingualize("acceptanceCriteria")}
                    disabled={!form.acceptanceCriteria.trim()}
                    translating={translating.acceptanceCriteria}
                  />
                </div>
                <textarea
                  value={form.acceptanceCriteria}
                  onChange={(e) => setForm({ ...form, acceptanceCriteria: e.target.value })}
                  rows={8}
                  placeholder={"・〇〇できること\n・△△の場合は××する"}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-y min-h-[200px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
                    <IconScale className="w-3.5 h-3.5 text-orange-500" />
                    {pt.backlogWorkloadScore}
                    <span className="text-xs text-gray-400 font-normal">({pointUnitLabel})</span>
                  </label>
                  <div className="flex flex-wrap gap-1.5" role="radiogroup">
                    {pointScale.map((v) => {
                      const isSelected = form.workloadScore === v
                      return (
                        <button
                          key={v}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          disabled={!canEdit}
                          onClick={() => setForm({ ...form, workloadScore: v })}
                          className={`min-w-[44px] px-3 py-2 text-sm font-semibold rounded-lg border-2 transition-all ${
                            isSelected
                              ? "bg-orange-500 border-orange-500 text-white shadow-sm"
                              : "bg-white border-gray-200 text-gray-700 hover:border-orange-300 hover:bg-orange-50"
                          } disabled:opacity-60 disabled:cursor-not-allowed`}
                        >
                          {v}
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">
                    {pointUnit === "SP" || pointUnit === "ポイント"
                      ? "フィボナッチスケール (Fibonacci)"
                      : pointUnitLabel}
                  </p>
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
                    <IconTag className="w-3.5 h-3.5 text-gray-500" />
                    {t.iceboxStatus}
                  </label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as "ready" | "not_ready" | "completed" })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
                  >
                    <option value="not_ready">{t.backlogStatusNotReady}</option>
                    <option value="ready">{t.backlogStatusReady}</option>
                    <option value="completed">{t.backlogStatusCompleted}</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                {canEdit && (
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 px-5 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 text-sm font-medium shadow-sm transition-all"
                  >
                    {editingId ? t.update : t.add}
                  </button>
                )}
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-5 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium transition-colors"
                >
                  {canEdit ? t.cancel : t.close}
                </button>
              </div>
            </fieldset>
            </form>
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div className="relative mb-6">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
          <IconSearch className="w-4 h-4 text-gray-400" />
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={`${pt.backlogInitiative} / ${pt.backlogEpic} / ${pt.backlogUserStory}`}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder:text-gray-400 bg-white shadow-sm"
        />
      </div>

      {/* Sections */}
      <div className="space-y-6">
        {renderSection(`Ready (${t.backlogStatusReady})`, filteredReady, true, "ready")}
        {renderSection(`Not Ready (${t.backlogStatusNotReady})`, filteredNotReady, false, "not_ready")}

        {/* Completed - collapsible */}
        <div>
          <button
            onClick={() => setShowCompleted(!showCompleted)}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-2 group transition-colors"
          >
            <span className={`transition-transform duration-200 ${showCompleted ? "rotate-0" : "-rotate-90"}`}>
              <IconChevronDown className="w-4 h-4" />
            </span>
            <span className="font-medium">{showCompleted ? t.backlogHideCompleted : t.backlogShowCompleted}</span>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
              {filteredCompleted.length}{t.items}
            </span>
          </button>
          {showCompleted && renderSection(t.backlogStatusCompleted, filteredCompleted, false, "completed")}
        </div>
      </div>

      {detailPbiId && (
        <PbiDetailModal
          projectId={projectId}
          pbiId={detailPbiId}
          onClose={() => setDetailPbiId(null)}
        />
      )}
      {investPbiId && (
        <AIResultModal
          title={t.aiInvestTitle}
          fetchUrl={`/api/projects/${projectId}/backlog/${investPbiId}/ai/invest-review`}
          fetchBody={{ lang: language }}
          onClose={() => setInvestPbiId(null)}
        />
      )}
    </div>
  )
}
