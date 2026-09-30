import { useId, type ReactNode } from "react"
import { Button, cn } from "@/components/ui"

interface SettingsCardProps {
  title: ReactNode
  /** Rendered right of the title (counts, status). */
  aside?: ReactNode
  tone?: "default" | "danger"
  children: ReactNode
}

/** One titled section of the project settings page. */
export function SettingsCard({ title, aside, tone = "default", children }: SettingsCardProps) {
  const headingId = useId()
  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "mb-6 rounded-ui-md border bg-surface p-6 shadow-ui-sm",
        tone === "danger" ? "border-danger/40" : "border-border",
      )}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2
          id={headingId}
          className={cn("flex items-center gap-2 text-title font-semibold", tone === "danger" ? "text-danger" : "text-fg")}
        >
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

interface SettingsSaveRowProps {
  isDirty: boolean
  saving: boolean
  label: string
  unsavedLabel: string
  /** Omit to render a submit button for the enclosing form. */
  onSave?: () => void
  disabled?: boolean
}

/**
 * Shared explicit-save footer: the button is enabled only while there are
 * unsaved edits, which are also announced next to it.
 */
export function SettingsSaveRow({ isDirty, saving, label, unsavedLabel, onSave, disabled }: SettingsSaveRowProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type={onSave ? "button" : "submit"}
        onClick={onSave}
        loading={saving}
        disabled={disabled || !isDirty}
      >
        {label}
      </Button>
      <span role="status" className="text-caption text-warning">
        {isDirty ? unsavedLabel : ""}
      </span>
    </div>
  )
}
