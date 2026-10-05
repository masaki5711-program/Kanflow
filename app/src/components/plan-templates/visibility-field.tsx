"use client"

import { useLanguage } from "@/lib/language-context"

interface Props {
  value: "public" | "private"
  onChange: (v: "public" | "private") => void
  /** Only the creator / an admin may change it (built-ins: never). */
  disabled?: boolean
  name: string
}

/** 公開範囲 radio group: みんなに共有 (default) / 自分だけ. */
export function VisibilityField({ value, onChange, disabled = false, name }: Props) {
  const { t } = useLanguage()
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="mb-1 text-caption font-medium text-fg-muted">{t.tplVisibility}</legend>
      <div className="flex flex-wrap gap-4">
        {(["public", "private"] as const).map((v) => (
          <label key={v} className="inline-flex min-h-9 items-center gap-2 text-body text-fg">
            <input type="radio" name={name} className="h-4 w-4" checked={value === v} onChange={() => onChange(v)} />
            {v === "public" ? t.tplVisibilityPublic : t.tplVisibilityPrivate}
          </label>
        ))}
      </div>
      <p className="mt-1 text-caption text-fg-muted">{disabled ? t.tplVisibilityLocked : t.tplVisibilityHint}</p>
    </fieldset>
  )
}
