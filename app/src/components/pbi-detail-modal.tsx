"use client"

import { useEffect, useState } from "react"
import { useLanguage } from "@/lib/language-context"
import { useBilingual } from "@/lib/use-bilingual"
import { BilingualViewToggle } from "@/components/bilingual-view-toggle"
import { AIResultModal } from "@/components/ai-result-modal"
import { useOverlayClose } from "@/lib/use-overlay-close"

interface PbiDetail {
  id: string
  displayId: number
  initiative: string | null
  epic: string | null
  userStory: string | null
  acceptanceCriteria: string | null
  referenceDoc: string | null
  workloadScore: number
  status: string
  notReadyReason: string | null
  poNote: string | null
  assignedPo: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
  productGoal: { id: string; title: string } | null
  iceboxItem: { id: string; displayId: number; request: string } | null
}

interface Props {
  projectId: string
  pbiId: string
  onClose: () => void
  /** When true and the viewer has rights, fields become editable. */
  editable?: boolean
  /** Called after a successful save so the caller can refresh its data. */
  onSaved?: () => void
}

const statusClass: Record<string, string> = {
  not_ready: "bg-amber-50 text-amber-700 border-amber-200",
  ready: "bg-blue-50 text-blue-700 border-blue-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
}

interface PbiForm {
  initiative: string
  epic: string
  userStory: string
  acceptanceCriteria: string
  workloadScore: string
  assignedPo: string
  status: string
  poNote: string
  notReadyReason: string
  referenceDoc: string
}

function toFormState(p: PbiDetail): PbiForm {
  return {
    initiative: p.initiative ?? "",
    epic: p.epic ?? "",
    userStory: p.userStory ?? "",
    acceptanceCriteria: p.acceptanceCriteria ?? "",
    workloadScore: p.workloadScore != null ? String(p.workloadScore) : "",
    assignedPo: p.assignedPo ?? "",
    status: p.status,
    poNote: p.poNote ?? "",
    notReadyReason: p.notReadyReason ?? "",
    referenceDoc: p.referenceDoc ?? "",
  }
}

/**
 * Centered modal showing the full details of a Product Backlog Item. When
 * `editable=true` and the viewer is a PO/SM/admin (the underlying API will
 * reject otherwise), every field becomes inline-editable and the footer
 * gains a Save button. Otherwise the modal stays read-only.
 */
export default function PbiDetailModal({ projectId, pbiId, onClose, editable, onSaved }: Props) {
  const { t, pt, language } = useLanguage()
  const [item, setItem] = useState<PbiDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showInvest, setShowInvest] = useState(false)
  const [form, setForm] = useState<PbiForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/projects/${projectId}/backlog/${pbiId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data: PbiDetail) => {
        if (!cancelled) {
          setItem(data)
          setForm(toFormState(data))
        }
      })
      .catch(() => { if (!cancelled) setError(t.error) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [projectId, pbiId, t.error])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const overlay = useOverlayClose(onClose)

  async function handleSave() {
    if (!item || !form) return
    setSaving(true)
    setSaveError(null)
    const patch: Record<string, unknown> = {}
    if (form.initiative !== (item.initiative ?? "")) patch.initiative = form.initiative || null
    if (form.epic !== (item.epic ?? "")) patch.epic = form.epic || null
    if (form.userStory !== (item.userStory ?? "")) patch.userStory = form.userStory || null
    if (form.acceptanceCriteria !== (item.acceptanceCriteria ?? "")) patch.acceptanceCriteria = form.acceptanceCriteria || null
    const ws = form.workloadScore.trim() === "" ? null : parseInt(form.workloadScore, 10)
    if (ws !== item.workloadScore) patch.workloadScore = ws
    if (form.assignedPo !== (item.assignedPo ?? "")) patch.assignedPo = form.assignedPo || null
    if (form.status !== item.status) patch.status = form.status
    if (form.poNote !== (item.poNote ?? "")) patch.poNote = form.poNote || null
    if (form.notReadyReason !== (item.notReadyReason ?? "")) patch.notReadyReason = form.notReadyReason || null
    if (form.referenceDoc !== (item.referenceDoc ?? "")) patch.referenceDoc = form.referenceDoc || null

    if (Object.keys(patch).length === 0) {
      setSaving(false)
      onClose()
      return
    }

    try {
      const res = await fetch(`/api/projects/${projectId}/backlog/${pbiId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        setSaveError(err?.error ?? t.error)
        setSaving(false)
        return
      }
      onSaved?.()
      onClose()
    } catch {
      setSaveError(t.error)
      setSaving(false)
    }
  }

  const isEditing = !!editable && !!form

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[60] p-4"
      {...overlay}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 shrink-0 flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
              <span className="font-mono">#{item?.displayId ?? "—"}</span>
              {item && !isEditing && (
                <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border ${statusClass[item.status] ?? "bg-gray-50 text-gray-600 border-gray-200"}`}>
                  {item.status === "ready" && "Ready"}
                  {item.status === "not_ready" && "Not Ready"}
                  {item.status === "completed" && "Completed"}
                </span>
              )}
              {item?.productGoal?.title && (
                <span className="inline-flex items-center text-[11px] text-indigo-600">→ {item.productGoal.title}</span>
              )}
            </div>
            <h3 className="text-lg font-bold text-gray-900 truncate">
              {item?.initiative || item?.userStory || (isEditing ? t.edit : t.view)}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
            title={t.close}
            aria-label={t.close}
          >
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <p className="text-sm text-gray-400 py-8 text-center">{t.loading}</p>
          ) : error || !item ? (
            <p className="text-sm text-red-500 py-8 text-center">{error ?? t.error}</p>
          ) : isEditing && form ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <EditField label={pt.backlogInitiative} value={form.initiative}
                  onChange={(v) => setForm({ ...form, initiative: v })} />
                <EditField label={pt.backlogEpic} value={form.epic}
                  onChange={(v) => setForm({ ...form, epic: v })} />
              </div>
              <EditField label={pt.backlogUserStory} value={form.userStory} multiline rows={5}
                onChange={(v) => setForm({ ...form, userStory: v })} />
              <EditField label={pt.backlogAcceptanceCriteria} value={form.acceptanceCriteria} multiline rows={7} placeholder={"・〇〇できること\n・△△の場合は××する"}
                onChange={(v) => setForm({ ...form, acceptanceCriteria: v })} />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">{pt.backlogWorkloadScore}</p>
                  <input type="number" min={0} step={1} value={form.workloadScore}
                    onChange={(e) => setForm({ ...form, workloadScore: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">{pt.rolePO}</p>
                  <input type="text" value={form.assignedPo}
                    onChange={(e) => setForm({ ...form, assignedPo: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">{t.sprintStatus}</p>
                  <select value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 bg-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
                    <option value="not_ready">Not Ready</option>
                    <option value="ready">Ready</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              </div>
              <EditField label="POメモ" value={form.poNote} multiline rows={2}
                onChange={(v) => setForm({ ...form, poNote: v })} />
              {form.status === "not_ready" && (
                <EditField label="Not Ready reason" value={form.notReadyReason} multiline rows={2}
                  onChange={(v) => setForm({ ...form, notReadyReason: v })} />
              )}
              <EditField label="Reference" value={form.referenceDoc} multiline rows={2}
                onChange={(v) => setForm({ ...form, referenceDoc: v })} />
              {saveError && (
                <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{saveError}</p>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label={pt.backlogInitiative} value={item.initiative} bilingual />
                <Field label={pt.backlogEpic} value={item.epic} bilingual />
              </div>
              <Field label={pt.backlogUserStory} value={item.userStory} multiline bilingual />
              <Field label={pt.backlogAcceptanceCriteria} value={item.acceptanceCriteria} multiline bilingual />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field
                  label={pt.backlogWorkloadScore}
                  value={item.workloadScore != null ? String(item.workloadScore) : null}
                />
                <Field label={pt.rolePO} value={item.assignedPo} />
                {item.iceboxItem && (
                  <Field
                    label={pt.iceboxTitle}
                    value={`#${item.iceboxItem.displayId} ${item.iceboxItem.request}`}
                  />
                )}
              </div>
              <Field label={t.view + ": " + "POメモ"} value={item.poNote} multiline />
              {item.status === "not_ready" && item.notReadyReason && (
                <Field label="Not Ready reason" value={item.notReadyReason} multiline />
              )}
              <Field label="Reference" value={item.referenceDoc} multiline />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between shrink-0 bg-gray-50/60 rounded-b-2xl">
          <button
            type="button"
            onClick={() => setShowInvest(true)}
            disabled={!item || loading}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-purple-700 border border-purple-300 rounded-lg hover:bg-purple-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <span aria-hidden>🤖</span>
            {t.aiInvestReview}
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
            >
              {isEditing ? t.cancel : t.close}
            </button>
            {isEditing && (
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || loading}
                className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? "..." : t.update}
              </button>
            )}
          </div>
        </div>
      </div>
      {showInvest && item && (
        <AIResultModal
          title={t.aiInvestTitle}
          fetchUrl={`/api/projects/${projectId}/backlog/${pbiId}/ai/invest-review`}
          fetchBody={{ lang: language }}
          onClose={() => setShowInvest(false)}
        />
      )}
    </div>
  )
}

function Field({
  label,
  value,
  multiline,
  bilingual,
}: {
  label: string
  value: string | null
  multiline?: boolean
  bilingual?: boolean
}) {
  const bil = useBilingual(value)
  const hasValue = !!(value && value.trim())
  const display = bilingual ? bil.display : value ?? ""
  return (
    <div>
      <div className="flex items-center justify-between mb-1 gap-2">
        <p className="text-xs font-medium text-gray-500">{label}</p>
        {bilingual && hasValue && (
          <BilingualViewToggle
            isTranslated={bil.isTranslated}
            loading={bil.loading}
            error={bil.error}
            onClick={bil.toggle}
          />
        )}
      </div>
      {hasValue ? (
        <p className={`text-sm text-gray-800 ${multiline || bil.isTranslated ? "whitespace-pre-wrap leading-relaxed" : ""} bg-gray-50 rounded-lg px-3 py-2 min-h-[38px]`}>
          {display}
        </p>
      ) : (
        <p className="text-sm text-gray-300 bg-gray-50 rounded-lg px-3 py-2 min-h-[38px]">—</p>
      )}
    </div>
  )
}

function EditField({
  label,
  value,
  onChange,
  multiline,
  rows,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  multiline?: boolean
  rows?: number
  placeholder?: string
}) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows ?? 3}
          placeholder={placeholder}
          className={`w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-y ${rows && rows >= 6 ? "min-h-[160px]" : ""}`}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
        />
      )}
    </div>
  )
}
