"use client"

import { useId } from "react"
import { Button, Textarea } from "@/components/ui"
import { GlossaryHint } from "@/components/i18n-text"
import { useLanguage } from "@/lib/language-context"
import type { GeneratedField } from "./use-ai-field-generator"
import { ListChecks, User } from "lucide-react"

interface AiButtonProps {
  field: GeneratedField
  generating: GeneratedField | null
  onGenerate: (field: GeneratedField) => void
}

interface NamedAiButtonProps extends AiButtonProps {
  /** Label of the field the button writes (makes the two ✨ buttons' names distinct). */
  fieldLabel: string
}

/**
 * ✨ AI draft button. While streaming it doubles as the stop control, so it is
 * deliberately rendered outside the disabled fieldset state.
 */
function AiGenerateButton({ field, generating, onGenerate, fieldLabel }: NamedAiButtonProps) {
  const { t } = useLanguage()
  const isRunning = generating === field
  const text = isRunning ? `${t.aiGenerating} — ${t.backlogAiStop}` : t.aiGenerate
  return (
    <Button
      // Visible text first (WCAG 2.5.3 label in name), then the field it writes.
      aria-label={`${text} (${fieldLabel})`}
      variant="ghost"
      size="sm"
      onClick={() => onGenerate(field)}
      disabled={generating !== null && !isRunning}
      aria-busy={isRunning || undefined}
      leftIcon={<span aria-hidden="true">{isRunning ? "⏹" : "✨"}</span>}
    >
      {text}
    </Button>
  )
}

interface StoryFieldProps extends AiButtonProps {
  value: string
  onChange: (value: string) => void
  /** Inline validation message (e.g. "a user story or an initiative is required"). */
  error?: string
}

export function UserStoryField({ value, onChange, field, generating, onGenerate, error }: StoryFieldProps) {
  const { t, pt } = useLanguage()
  const id = useId()
  const rulesId = `${id}-rules`
  const errorId = `${id}-error`
  return (
    <div className="rounded-ui-lg border-2 border-primary-soft bg-primary-soft/30 p-5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={id} className="flex items-center gap-2 text-body font-semibold text-fg">
          <User className="h-4 w-4 text-primary" />
          {pt.backlogUserStory}
        </label>
        <AiGenerateButton field={field} generating={generating} onGenerate={onGenerate} fieldLabel={pt.backlogUserStory} />
      </div>
      <div id={rulesId} className="mb-3 rounded-ui-md border border-primary-soft bg-surface px-3 py-2 text-caption leading-relaxed text-fg-muted">
        <p className="mb-1 font-semibold text-primary">{t.backlogWritingRules}</p>
        <p className="mb-1.5 rounded bg-primary-soft/40 px-2 py-1.5 font-mono text-fg">
          {t.backlogUserStoryFormat
            .replace("{who}", pt.backlogWho)
            .replace("{what}", pt.backlogWhat)
            .replace("{why}", pt.backlogWhy)}
        </p>
        <p>
          {t.backlogExampleLabel}: {t.backlogUserStoryPlaceholder}
        </p>
      </div>
      <Textarea
        id={id}
        aria-describedby={error ? `${rulesId} ${errorId}` : rulesId}
        aria-invalid={error ? true : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t.backlogUserStoryPlaceholder}
        readOnly={generating !== null}
        rows={6}
        className="resize-y"
      />
      {error && (
        <p id={errorId} role="alert" className="mt-1 text-caption text-danger">
          {error}
        </p>
      )}
      <GlossaryHint className="mt-1" />
    </div>
  )
}

export function AcceptanceCriteriaField({ value, onChange, field, generating, onGenerate }: StoryFieldProps) {
  const { t, pt } = useLanguage()
  const id = useId()
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={id} className="flex items-center gap-1.5 text-body font-medium text-fg">
          <ListChecks className="h-3.5 w-3.5 text-fg-muted" />
          {pt.backlogAcceptanceCriteria}
        </label>
        <AiGenerateButton field={field} generating={generating} onGenerate={onGenerate} fieldLabel={pt.backlogAcceptanceCriteria} />
      </div>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={generating !== null}
        rows={8}
        autoGrow
        placeholder={t.backlogAcceptanceCriteriaPlaceholder}
        className="min-h-[200px]"
      />
    </div>
  )
}
