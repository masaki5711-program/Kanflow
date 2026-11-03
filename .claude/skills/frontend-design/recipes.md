# Component Recipes (ZEVA-Link default tokens)

Copy-paste starting points that consume `design-tokens.json`. Tailwind classes
assume the tokens are mapped into `theme.extend` (`bg-surface`, `text-primary`,
etc.); substitute CSS variables if the project uses them. All user-facing
strings go through i18n keys (`ui-i18n-gate`) — the literals below are
placeholders.

## 1. KPI stat tile

Hierarchy: value dominates, label recedes, delta is semantic — never three
equal-weight lines.

```tsx
function StatTile({ label, value, delta, severity }: StatTileProps) {
  return (
    <div className="rounded-md border border-border bg-surface p-6 shadow-raised">
      <p className="text-sm font-medium text-text-secondary">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums text-text-primary">
        {value}
      </p>
      {delta && (
        <p className={`mt-1 inline-flex items-center gap-1 text-sm font-medium ${
          severity === 'ok' ? 'text-ok' : severity === 'critical' ? 'text-critical' : 'text-warning'
        }`}>
          <DeltaIcon severity={severity} aria-hidden />
          <span>{delta}</span>
        </p>
      )}
    </div>
  );
}
```

## 2. Severity badge (SPC / alert)

Color + icon + label — never color alone (semantic tokens `ok / warning /
critical / info / offline`).

```tsx
const SEVERITY_STYLES = {
  ok:       'bg-ok/10 text-ok border-ok/30',
  warning:  'bg-warning/10 text-warning border-warning/30',
  critical: 'bg-critical/10 text-critical border-critical/30',
  offline:  'bg-offline/10 text-offline border-offline/30',
} as const;

function SeverityBadge({ severity, children }: SeverityBadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${SEVERITY_STYLES[severity]}`}>
      <SeverityIcon severity={severity} aria-hidden />
      {children}
    </span>
  );
}
```

## 3. Data table shell

Dense but hierarchical: sticky muted header, tabular numerals, row hover,
right-aligned numbers, explicit empty/loading states.

```tsx
<div className="overflow-hidden rounded-md border border-border bg-surface">
  <table className="w-full text-sm">
    <thead className="sticky top-0 bg-surface-sunken text-left text-xs font-medium uppercase tracking-wide text-text-muted">
      <tr>
        <th scope="col" className="px-4 py-3">{t('col.equipment')}</th>
        <th scope="col" className="px-4 py-3 text-right">{t('col.value')}</th>
      </tr>
    </thead>
    <tbody className="divide-y divide-border">
      {rows.length === 0 ? (
        <tr><td colSpan={2} className="px-4 py-12 text-center text-text-muted">{t('table.empty')}</td></tr>
      ) : rows.map(row => (
        <tr key={row.id} className="transition-colors hover:bg-surface-sunken/60 focus-within:bg-surface-sunken/60">
          <td className="px-4 py-2.5 font-medium text-text-primary">{row.name}</td>
          <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">{row.value}</td>
        </tr>
      ))}
    </tbody>
  </table>
</div>
```

## 4. Dashboard shell + chart container

Bento composition with one dominant panel — not a uniform card grid. Charts
take colors from `charts.categorical`; gridlines use `charts.gridline`.

```tsx
<main className="min-h-screen bg-bg p-8">
  <header className="mb-8 flex items-end justify-between">
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-text-primary">{t('dashboard.title')}</h1>
      <p className="mt-1 text-sm text-text-secondary">{t('dashboard.subtitle')}</p>
    </div>
    <PlantSelector />
  </header>

  <div className="grid grid-cols-12 gap-6">
    <section className="col-span-12 lg:col-span-8 rounded-lg border border-border bg-surface p-6 shadow-raised">
      <ChartContainer title={t('chart.spcTrend')} />   {/* dominant panel */}
    </section>
    <aside className="col-span-12 lg:col-span-4 flex flex-col gap-6">
      <StatTile /* ... */ />
      <AlertFeed /* ... */ />
    </aside>
  </div>
</main>
```

Every interactive element needs visible `hover:` / `focus-visible:` / `active:`
treatment; every async panel needs loading and error states. Check the result
against `.claude/rules/web/design-quality.md` before delivering.
