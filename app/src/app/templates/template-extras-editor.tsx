"use client"

import { Plus, Trash2 } from "lucide-react"
import { Button, Field, IconButton, Input } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { newKey, type TemplateForm } from "./lib/editor-state"

interface Props {
  form: TemplateForm
  set: <K extends keyof TemplateForm>(key: K, value: TemplateForm[K]) => void
  disabled: boolean
}

const LIST_MAX = 50

/**
 * Settings the later マイルストーン・検収ボード reads: the 呼び名 of the
 * check items, the check items (name + 判定基準), 引き渡し資料 and the budget flag.
 */
export function TemplateExtrasEditor({ form, set, disabled }: Props) {
  const { t } = useLanguage()
  return (
    <section aria-labelledby="tpl-extras-title" className="space-y-4 rounded-ui-lg border border-border bg-surface p-4">
      <div>
        <h2 id="tpl-extras-title" className="text-body font-semibold text-fg">{t.tplExtras}</h2>
        <p className="text-caption text-fg-muted">{t.tplExtrasHint}</p>
      </div>
      <Field label={t.tplCheckLabel} hint={t.tplCheckLabelHint}>
        <Input value={form.checkLabel} maxLength={40} disabled={disabled} onChange={(e) => set("checkLabel", e.target.value)} className="sm:max-w-xs" />
      </Field>

      <fieldset className="space-y-2" disabled={disabled}>
        <legend className="mb-1 text-caption font-medium text-fg-muted">{t.tplChecks}</legend>
        <ul className="space-y-2">
          {form.checks.map((c, i) => (
            <li key={c.key} className="flex flex-wrap items-center gap-2">
              <Input
                aria-label={`${t.tplCheckName} ${i + 1}`}
                placeholder={t.tplCheckName}
                value={c.name}
                maxLength={255}
                onChange={(e) => set("checks", form.checks.map((x) => (x.key === c.key ? { ...x, name: e.target.value } : x)))}
                className="min-w-0 flex-[1_1_10rem]"
              />
              <Input
                aria-label={`${t.tplCheckCriterion} ${i + 1}`}
                placeholder={t.tplCheckCriterion}
                value={c.criterion}
                maxLength={1000}
                onChange={(e) => set("checks", form.checks.map((x) => (x.key === c.key ? { ...x, criterion: e.target.value } : x)))}
                className="min-w-0 flex-[2_1_14rem]"
              />
              <IconButton size="sm" label={t.tplRemoveCheck} icon={<Trash2 className="h-4 w-4" />} onClick={() => set("checks", form.checks.filter((x) => x.key !== c.key))} />
            </li>
          ))}
        </ul>
        <Button
          variant="ghost"
          size="sm"
          leftIcon={<Plus className="h-4 w-4" />}
          disabled={form.checks.length >= LIST_MAX}
          onClick={() => set("checks", [...form.checks, { key: newKey(), name: "", criterion: "" }])}
        >
          {t.tplAddCheck}
        </Button>
      </fieldset>

      <fieldset className="space-y-2" disabled={disabled}>
        <legend className="mb-1 text-caption font-medium text-fg-muted">{t.tplDocuments}</legend>
        <ul className="space-y-2">
          {form.documents.map((d, i) => (
            <li key={d.key} className="flex items-center gap-2">
              <Input
                aria-label={`${t.tplDocumentName} ${i + 1}`}
                placeholder={t.tplDocumentName}
                value={d.name}
                maxLength={255}
                onChange={(e) => set("documents", form.documents.map((x) => (x.key === d.key ? { ...x, name: e.target.value } : x)))}
                className="min-w-0 flex-1"
              />
              <IconButton size="sm" label={t.tplRemoveDocument} icon={<Trash2 className="h-4 w-4" />} onClick={() => set("documents", form.documents.filter((x) => x.key !== d.key))} />
            </li>
          ))}
        </ul>
        <Button
          variant="ghost"
          size="sm"
          leftIcon={<Plus className="h-4 w-4" />}
          disabled={form.documents.length >= LIST_MAX}
          onClick={() => set("documents", [...form.documents, { key: newKey(), name: "" }])}
        >
          {t.tplAddDocument}
        </Button>
      </fieldset>

      <label className="inline-flex min-h-9 items-center gap-2 text-body text-fg">
        <input type="checkbox" className="h-4 w-4" checked={form.budgetEnabled} disabled={disabled} onChange={(e) => set("budgetEnabled", e.target.checked)} />
        {t.tplBudget}
      </label>
    </section>
  )
}
