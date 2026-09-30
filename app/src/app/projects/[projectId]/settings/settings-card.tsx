import { useId, type ReactNode } from "react"
import { cn } from "@/components/ui"

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
