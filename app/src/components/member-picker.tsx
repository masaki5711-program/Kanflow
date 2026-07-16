"use client"

import { useEffect, useRef, useState } from "react"
import { useLanguage } from "@/lib/language-context"

export interface UserSearchResult {
  id: string
  name: string
  email: string
  employeeNumber: string | null
  department: string | null
  isMember: boolean
}

interface Props {
  projectId: string
  onAdded: () => void
  rolePT: { rolePO: string; roleSM: string; roleDev: string }
}

export function MemberPicker({ projectId, onAdded, rolePT }: Props) {
  const { t } = useLanguage()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<UserSearchResult[]>([])
  const [selected, setSelected] = useState<UserSearchResult[]>([])
  const [role, setRole] = useState<"po" | "sm" | "dev">("dev")
  const [searching, setSearching] = useState(false)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState("")
  const [focused, setFocused] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      setSearching(false)
      return
    }

    setSearching(true)
    const handle = setTimeout(() => {
      abortRef.current?.abort()
      const ac = new AbortController()
      abortRef.current = ac

      fetch(
        `/api/users/search?q=${encodeURIComponent(q)}&excludeProjectId=${encodeURIComponent(projectId)}`,
        { signal: ac.signal },
      )
        .then((r) => (r.ok ? r.json() : Promise.reject(r)))
        .then((data: UserSearchResult[]) => setResults(data))
        .catch(() => {})
        .finally(() => setSearching(false))
    }, 200)

    return () => {
      clearTimeout(handle)
    }
  }, [query, projectId])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setFocused(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  function pickUser(u: UserSearchResult) {
    if (u.isMember) return
    setSelected((prev) => (prev.some((x) => x.id === u.id) ? prev : [...prev, u]))
    // Clear search and close dropdown after selection so the user can search
    // for the next person without manually clearing the field.
    setQuery("")
    setResults([])
    setFocused(false)
    // Re-focus the input so they can immediately keep typing the next name.
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  function removeFromSelected(id: string) {
    setSelected((prev) => prev.filter((x) => x.id !== id))
  }

  async function handleAdd() {
    if (selected.length === 0) return
    setAdding(true)
    setError("")
    try {
      const res = await fetch(`/api/projects/${projectId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userIds: selected.map((u) => u.id),
          role,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(typeof data?.error === "string" ? data.error : t.error)
        return
      }
      setSelected([])
      setQuery("")
      setResults([])
      onAdded()
    } finally {
      setAdding(false)
    }
  }

  const selectedIds = new Set(selected.map((u) => u.id))
  const q = query.trim()
  const showDropdown = focused && q.length >= 1

  return (
    <div ref={containerRef} className="relative">
      <div className="flex flex-wrap items-center gap-2 border border-gray-200 rounded-xl px-2 py-2 bg-white focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500">
        {selected.map((u) => (
          <span
            key={u.id}
            className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 text-sm px-2.5 py-1 rounded-lg border border-blue-200"
          >
            <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold">
              {u.name.slice(0, 1)}
            </span>
            <span className="font-medium">{u.name}</span>
            {u.department && (
              <span className="text-xs text-blue-500">· {u.department}</span>
            )}
            <button
              type="button"
              onClick={() => removeFromSelected(u.id)}
              className="ml-0.5 text-blue-400 hover:text-blue-700"
              aria-label="remove"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
              </svg>
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          placeholder={t.memberPickerSearchPlaceholder}
          className="flex-1 min-w-[220px] bg-transparent px-2 py-1 text-sm outline-none placeholder:text-gray-400"
        />
      </div>

      {showDropdown && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-80 overflow-y-auto">
          {q.length < 2 ? (
            <div className="px-4 py-3 text-sm text-gray-400">{t.memberPickerEmpty}</div>
          ) : searching ? (
            <div className="px-4 py-3 text-sm text-gray-400">{t.loading}</div>
          ) : results.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-400">{t.userNoResults}</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {results.map((u) => {
                const isSel = selectedIds.has(u.id)
                const disabled = u.isMember || isSel
                return (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => pickUser(u)}
                      disabled={disabled}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        disabled
                          ? "bg-gray-50 cursor-not-allowed opacity-60"
                          : "hover:bg-blue-50"
                      }`}
                    >
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center text-sm font-semibold text-slate-600 shrink-0">
                        {u.name.slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-gray-900 truncate">{u.name}</span>
                          {u.employeeNumber && (
                            <span className="text-xs text-gray-400 font-mono">{u.employeeNumber}</span>
                          )}
                          {u.isMember && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                              {t.memberPickerAlreadyAdded}
                            </span>
                          )}
                          {!u.isMember && isSel && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-medium">
                              ✓ {t.memberPickerSelected}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 truncate flex items-center gap-2">
                          <span>{u.email}</span>
                          {u.department && <span className="text-gray-400">· {u.department}</span>}
                        </div>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {selected.length > 0 && (
        <div className="mt-3 flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3">
          <span className="text-sm text-gray-600">
            <strong className="text-gray-900">{selected.length}</strong> {t.memberPickerSelected}
          </span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "po" | "sm" | "dev")}
            className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          >
            <option value="dev">{rolePT.roleDev}</option>
            <option value="sm">{rolePT.roleSM}</option>
            <option value="po">{rolePT.rolePO}</option>
          </select>
          <button
            onClick={handleAdd}
            disabled={adding}
            className="ml-auto inline-flex items-center gap-2 px-4 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd"/>
            </svg>
            {t.memberPickerAddSelected}
          </button>
        </div>
      )}

      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}
    </div>
  )
}
