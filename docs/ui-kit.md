# Kanflow UI kit — adoption guide

Shared primitives live in `app/src/components/ui/` (barrel: `@/components/ui`) and
hooks in `app/src/hooks/` (barrel: `@/hooks`). Everything is client-side
(`"use client"` where needed), accessible by default, and localized (ja/en/id)
for its built-in labels; every label can be overridden with props.

`ToastProvider` and `ConfirmProvider` are already mounted in
`src/components/providers.tsx` (inside `LanguageProvider`).

---

## 1. Design tokens (`src/app/globals.css`)

Defined with Tailwind 4 `@theme static`, so each is both a utility and a CSS variable.
They do **not** override stock Tailwind scales (`rounded-lg`, `shadow-md`, `text-sm` are unchanged).

| Token | Utility examples | Value / note |
|---|---|---|
| `--color-primary` / `-hover` / `-active` / `-soft` / `-fg` / `-strong` | `bg-primary hover:bg-primary-hover text-primary-fg bg-primary-soft text-primary-strong` | blue-600 / 700 / 800 / 100 / white / 700 — on `bg-primary-soft` use `text-primary-strong` (5.5:1; `text-primary` is only 4.2:1) |
| `--color-danger` / `-hover` / `-soft` / `-strong` | `bg-danger text-danger bg-danger-soft text-danger-strong` | red-600; on `bg-danger-soft` use `text-danger-strong` (red-700, 5.3:1) |
| `--color-success` / `-hover` / `-soft` / `-strong` | `text-success bg-success-soft text-success-strong` | green-700 (5.0:1); strong green-800 6.5:1 on soft |
| `--color-warning` / `-hover` / `-soft` / `-strong` | `text-warning bg-warning-soft text-warning-strong` | amber-700 (5.0:1); strong amber-800 6.4:1 on soft |
| `--color-info` / `-soft` | `text-info bg-info-soft` | sky-700 |
| `--color-surface` / `-muted` / `-sunken` | `bg-surface bg-surface-muted bg-surface-sunken` | white / slate-50 / slate-100 |
| `--color-border` / `-strong` | `border-border border-border-strong` | slate-200 (decorative dividers) / #7b8799 — **inputs & secondary buttons** (3.6:1 on white, ≥ 3:1 on every surface, WCAG 1.4.11) |
| `--color-fg` / `-muted` / `-subtle` | `text-fg text-fg-muted text-fg-subtle` | 17.8:1 / 7.6:1 / 5.7:1 on white (fg-subtle #5a687c: 5.2:1 on surface-sunken, 4.6:1 on primary-soft / border) |
| `--color-focus` | (used by the global focus ring) | blue-600 |
| `--radius-ui-sm/md/lg` | `rounded-ui-sm rounded-ui-md rounded-ui-lg` | 8 / 12 / 16px |
| `--shadow-ui-sm/md/lg/overlay` | `shadow-ui-md` | elevation levels |
| `--text-caption/body/body-lg/title/heading` | `text-caption text-body …` | 12 / 14 / 16 / 18 / 22px — **nothing smaller than 12px** |
| `--ease-ui` | `ease-ui` | standard easing |
| page widths (`@utility`) | `<main id="main-content" className="page-narrow">` / `page-wide` | top-level page `<main>`: narrow = 48rem (forms, settings, profile, small admin lists), wide = 80rem (project list, admin tables). Includes gutters (16px / 24px from `sm`) and 2rem vertical padding |

Global rules:
- **Focus**: every interactive element gets `outline: 2px solid var(--color-focus); outline-offset: 2px` on `:focus-visible`. It is unlayered, so it wins over legacy `focus:outline-none`. Do not try to remove it.
- **No `transition: all`**: base transitions cover color/background/border/shadow/opacity only.
- **Reduced motion**: `prefers-reduced-motion: reduce` disables animations/transitions globally — except elements marked `data-spinner`, which keep turning slowly (1.5s) so loading never looks frozen. The mobile sidebar drawer slides in/out (`animate-drawer-in/out`) and closes instantly under reduced motion.
- **Sticky header**: `html { scroll-padding-top }` keeps focused/anchored elements below the 56px header (WCAG 2.4.11).
- **Skip link**: `SkipLink` (root layout) is the first tab stop and focuses `#main-content` or the first `<main>`; give page `<main>`s `id="main-content"` where possible.
- **`<html lang>`** follows the active language (`LanguageProvider` effect); login sets it too.
- **Light only**: `color-scheme: light`; `dark:` utilities only apply under a `.dark` class that is never set (stray `dark:` classes are inert — remove them when you touch a file).
- Text colour rule of thumb: never use `text-gray-400`/`text-gray-300` for text. Use `text-fg-muted` for secondary text, `text-fg-subtle` only as the lightest allowed. Text on a `*-soft` background uses the matching `*-strong` token.

---

## 2. Components (`@/components/ui`)

### Button / IconButton / buttonClasses
```tsx
<Button variant="primary" size="md" loading={saving} leftIcon={<Save className="h-4 w-4" />} onClick={save}>
  {t.save}
</Button>
<IconButton label={t.delete} icon={<Trash2 className="h-4 w-4" />} variant="danger" size="sm" onClick={del} />
<Link href="/" className={buttonClasses({ variant: "secondary" })}>{t.errorGoHome}</Link>
```
- `Button` props: all `<button>` props + `variant?: "primary"|"secondary"|"danger"|"ghost"|"link"` (default primary), `size?: "sm"|"md"|"lg"` (min-height 32/36/44px), `loading?` (spinner + `aria-busy` + disabled), `leftIcon?`, `rightIcon?`, `fullWidth?`, **`children` required**. `type` defaults to `"button"`.
- `IconButton` props: **`label: string` required** (aria-label + title), `icon`, `variant?` (no `link`, default ghost), `size?` (32/36/44px square), `loading?`, `showTitle?` (default true).
- `buttonClasses({ variant, size, fullWidth, className })` → class string for links.

### Field + Input / Textarea / Select
```tsx
<Field label={t.title} required hint={t.titleHint} error={errors.title}>
  <Input value={title} onChange={(e) => setTitle(e.target.value)} />
</Field>
<Field label={t.status}>
  <Select value={status} onChange={(e) => setStatus(e.target.value)}>…</Select>
</Field>
<Field label={t.assignee}>{(control) => <MemberPicker {...control} />}</Field>
```
- `Field` props: `label`, `hint?`, `error?` (sets `aria-invalid`, rendered `role="alert"`), `required?` (visual `*` + SR "required"), `id?` (else `useId()`), `hideLabel?`, `className?`, `children: ReactNode | (control) => ReactNode`.
- The control automatically receives `id`, `aria-describedby` (hint+error), `aria-invalid`, `aria-required`. Custom controls: `useFieldControl()` returns those props (or null outside a Field).
- `Input` (+`inputSize?: sm|md|lg`), `Textarea` (`rows` default 4), `Select` (+`selectSize?`) — plain native props otherwise; invalid state styles red.

### Modal
```tsx
<Modal
  open={open}
  onClose={() => setOpen(false)}
  title={t.editPbi}
  description={pbi.key}
  size="lg"                      // sm | md | lg | xl | full
  isDirty={form !== initial}     // asks "discard changes?" via the confirm dialog
  footer={<EditFooter saving={saving} />}
>
  …form…
</Modal>

function EditFooter({ saving }: { saving: boolean }) {
  const close = useModalClose()  // guarded close (honours isDirty)
  return (<>
    <Button variant="secondary" onClick={close}>{t.cancel}</Button>
    <Button type="submit" form="pbi-form" loading={saving}>{t.save}</Button>
  </>)
}
```
Props: `open`, `onClose(reason: "escape"|"overlay"|"close-button"|"request")` (called **after** the dirty check passed), `title` (accessible name), `description?`, `children`, `footer?` (sticky), `headerActions?`, `size?` (default md), `closeOnOverlayClick?` (default **false** — requires press+release on the backdrop), `closeOnEsc?` (default true), `isDirty?`, `dirtyConfirm?: { title?, message?, confirmLabel?, cancelLabel? }`, `initialFocusRef?`, `hideCloseButton?`, `closeLabel?`, `className?`, `bodyClassName?`.
Behaviour: portal to `<body>`, `role="dialog"` + `aria-modal`, labelled by title, focus trapped, initial focus = `initialFocusRef` → `[data-autofocus]` → first focusable in body; focus restored on close; Esc only closes the top-most layer (a confirm on top of a modal is handled correctly); body scroll lock (ref-counted); full-screen below `sm`, header/footer stay fixed while body scrolls.

#### Modal size & backdrop guidance
| Content | `size` | `closeOnOverlayClick` |
|---|---|---|
| Tiny dialog / single field / short read-only list (reset password, deadline tasks) | `sm` | forms `false`, viewers `true` |
| Small form (≤ ~5 simple fields: category, section, event, IceBox item, release, sprint edit) | `md` (default) | `false` (default) |
| Large form or picker list (goal, plan item, sprint task, project create, user, add PBI, release import, fixed tasks) | `lg` | `false` |
| Detail / multi-panel view (PBI detail, sprint review & retrospective, structured AI report, AI draft picker) | `xl` | `true` only while read-only (PBI detail: `!isEditing`; AI result: once generation finished) |
| Media viewer | own full-screen dialog | `true` |

Rule: anything with editable input keeps the default `closeOnOverlayClick={false}` (plus `isDirty`); pure viewers close on backdrop click. Similar dialogs must use the same size.

### Confirm dialog (existing API, fixed)
`const confirm = useConfirm(); if (await confirm({ title, message, confirmLabel, cancelLabel, variant: "danger"|"warning"|"info" })) …`
Now `role="alertdialog"`, focus starts on **Cancel**, Enter only activates the focused button (the "Enter on Cancel deletes" bug is gone), Esc cancels, focus returns to the trigger, default labels localized. `useOptionalConfirm()` returns null outside the provider.

### Toast
```tsx
const toast = useToast()
toast.success(t.saved)
toast.error(err.message, { title: t.saveFailed })
toast.info(t.syncing, { duration: 0 })   // 0 = sticky
const id = toast.info("…"); toast.dismiss(id)
```
The region sits at the **top** (top-right below the header on desktop, top edge on mobile) so it never covers modal footers. **F6** moves focus to the newest toast's dismiss button and back (no trap); **Esc** on a focused toast dismisses it (without closing an open modal).
Use success toasts only for explicit saves/creates/deletes — not for inline edits, autosave, drag & drop or toggles whose result is already visible in place.
Errors go to a `role="alert"` (assertive) region, success/info to `role="status"` (polite). Auto-dismiss 4s/5s/8s (success/info/error), paused on hover/focus, max 4 stacked (oldest dropped), identical toasts collapse. `useOptionalToast()` returns null outside the provider.

### Others
| Component | Usage |
|---|---|
| `Spinner` | `<Spinner size="xs|sm|md|lg" label={t.loading} />` — without `label` it is decorative |
| `Badge` | `<Badge tone="neutral|primary|success|warning|danger|info" size="sm|md" dot>{t.done}</Badge>` |
| `Skeleton` | `<Skeleton className="h-4 w-1/3" />` (aria-hidden) |
| `SkeletonLines` | `<SkeletonLines lines={3} label={t.loading} />` |
| `SkeletonCard` | `<SkeletonCard label={t.loading} />` |
| `SkeletonTable` | `<SkeletonTable rows={5} columns={4} label={t.loading} />` |
| `EmptyState` | `<EmptyState icon={<Inbox className="h-6 w-6" />} title={t.noItems} description={…} action={<Button>…</Button>} compact headingLevel={3} />` |
| `Truncate` | `<Truncate text={pbi.title} lines={2} as="h3" className="text-body font-medium" />` — full text stays in DOM + `title` tooltip |
| `VisuallyHidden` | `<VisuallyHidden>{t.openMenu}</VisuallyHidden>` / `as="h2"` |
| `cn(...)` | tiny class joiner |
| `useUiLabels()` | kit's localized default labels (ok, cancel, close, loading, …) |

---

## 3. Hooks (`@/hooks`)

### `apiFetch<T>(url, init?)`
```ts
const created = await apiFetch<Goal>(`/api/projects/${id}/goals`, { method: "POST", json: form })
```
- `init`: normal `RequestInit` + `json?: unknown` (stringified, sets Content-Type) + `parse?: (raw) => T` (e.g. zod `schema.parse`).
- Resolves with parsed JSON / text / `undefined` (204 or empty).
- Rejects with `ApiError { message, status, body, code?, isNetworkError }` — `message` is the server's `{ error }` / `{ message }` text. Network failure → `status 0`. `AbortError` re-thrown as-is (`isAbortError(err)`).
- Emits the `kanflow:activity` event (keeps the idle-logout session alive).
- Also exported: `isApiError`, `parseErrorMessage(body, status, statusText?)`.

### `useApiFetch()` — apiFetch + toasts for event handlers
```ts
const api = useApiFetch()
await api(`/api/…`, { method: "DELETE", toastOnError: true, toastOnSuccess: t.deleted })
```
Still re-throws, so callers can branch on failure.

### `useApiQuery<T>(url | null, options?)`
```ts
const { data, error, isLoading, isFetching, refetch, mutate } =
  useApiQuery<Sprint[]>(projectId ? `/api/projects/${projectId}/sprints` : null, { toastOnError: true })
```
Options: `parse?`, `initialData?`, `enabled?` (default true), `init?` (headers etc., read at request time), `toastOnError?: boolean | (err) => string`.
Returns: `data`, `error`, `isLoading` (in flight and nothing to show → skeleton), `isFetching` (any in-flight incl. refetch), `refetch()`, `mutate(valueOrUpdater)`.
Guarantees: request aborted on unmount / URL change; a late response for an old URL is never applied; data of URL A is never shown for URL B; failed refetch keeps the last good data and exposes `error`.

### `useApiMutation(fn, options?)`
```ts
const { data: items, mutate: setItems } = useApiQuery<Item[]>(url)
const remove = useApiMutation(
  (id: string) => apiFetch(`${url}/${id}`, { method: "DELETE" }),
  {
    onMutate: (id) => { const prev = items; setItems((l) => l?.filter((i) => i.id !== id)); return prev },
    rollback: (prev) => setItems(prev),
    toastOnError: true,
  },
)
<IconButton label={t.delete} icon={<Trash2 />} loading={remove.isPending} onClick={() => remove.mutate(item.id)} />
```
Options: `onMutate?(vars) => snapshot`, `rollback?(snapshot, error, vars)`, `onSuccess?(result, vars)`, `onError?(error, vars)`, `toastOnError?`, `toastOnSuccess?: string | (result) => string`.
Returns: `mutate(vars) → Promise<result | undefined>` (never throws), `mutateAsync(vars)` (throws), `isPending`, `error`, `reset()`.

### Others
| Hook | Signature |
|---|---|
| `useUnsavedChangesGuard(isDirty)` | `beforeunload` warning while dirty (full-page navigation / tab close) |
| `useFocusTrap(ref, active, { initialFocus?, restoreFocus? = true, onEscape? })` | trap for custom overlays (drawers, popovers); cooperates with Modal/Confirm stacking |
| `useBodyScrollLock(active)` / `lockBodyScroll()` | ref-counted page scroll lock |
| `useMediaQuery(query, serverValue = false)` / `useIsMobile()` | `useSyncExternalStore`-based |
| `emitActivity()` / `ACTIVITY_EVENT` | signal "user is active" to the idle watcher |

---

## 4. Migration recipes

### `alert()` → toast
```diff
- if (!res.ok) { alert(t.saveFailed); return }
+ const api = useApiFetch()
+ try { await api(url, { method: "PATCH", json: body, toastOnError: () => t.saveFailed }) }
+ catch { return }
```
or simply `toast.error(message)` / `toast.success(t.saved)`. Never use `alert()` / `window.confirm()` — use `useToast` / `useConfirm`.

### `fetch` + `useEffect` + `useState` → `useApiQuery`
```diff
- const [items, setItems] = useState<Item[]>([])
- const [loading, setLoading] = useState(true)
- useEffect(() => { fetch(url).then(r => r.json()).then(setItems).finally(() => setLoading(false)) }, [url])
+ const { data: items = [], isLoading, error, refetch, mutate: setItems } = useApiQuery<Item[]>(url, { toastOnError: true })
```
Replace `loadData()` calls after writes with `refetch()` or a local `mutate(...)`.

### Ad-hoc modal → `Modal`
```diff
- {open && (
-   <div className="fixed inset-0 bg-black/40 flex items-center justify-center" {...useOverlayClose(onClose)}>
-     <div className="bg-white rounded-2xl p-6 max-w-lg w-full">
-       <div className="flex justify-between"><h3>{t.title}</h3><button onClick={onClose}>✕</button></div>
-       …body…
-       <div className="flex justify-end gap-2"><button onClick={onClose}>{t.cancel}</button><button onClick={save}>{t.save}</button></div>
-     </div>
-   </div>
- )}
+ <Modal open={open} onClose={onClose} title={t.title} isDirty={dirty}
+   footer={<><Button variant="secondary" onClick={onClose}>{t.cancel}</Button><Button loading={saving} onClick={save}>{t.save}</Button></>}>
+   …body…
+ </Modal>
```
Remove the component's own Escape `keydown` listeners, `autoFocus` hacks and body-overflow toggles — Modal does all of it. (For a guarded Cancel inside the footer, render the footer as a small component that calls `useModalClose()`.)

### Bare `<label>` → `Field`
```diff
- <label className="block text-sm …">{t.title}</label>
- <input className="w-full border …" value={title} onChange={…} />
- {err && <p className="text-red-500 text-xs">{err}</p>}
+ <Field label={t.title} error={err} required>
+   <Input value={title} onChange={…} />
+ </Field>
```

### Hover-only actions → also visible on keyboard focus
Buttons that only appear on hover are unreachable-looking for keyboard users. Add `group-focus-within:opacity-100` (and ensure the parent has `group`):
```diff
- <div className="group …">
-   <div className="opacity-0 group-hover:opacity-100">
+ <div className="group …">
+   <div className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
```
On touch devices consider always showing them: `opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100`.

### Icon-only `<button title="…">` → `IconButton`
```diff
- <button onClick={del} title={t.delete} className="p-1 text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
+ <IconButton label={t.delete} icon={<Trash2 className="h-4 w-4" />} size="sm" onClick={del} />
```

### Loading text → Skeleton, empty text → EmptyState
```diff
- {loading ? <p className="text-gray-400">{t.loading}</p> : items.length === 0 ? <p className="text-gray-400">{t.noItems}</p> : …}
+ {isLoading ? <SkeletonTable label={t.loading} /> : items.length === 0 ? <EmptyState title={t.noItems} /> : …}
```

### Raw colours → tokens (when touching a file)
`text-gray-400` → `text-fg-subtle` (or `text-fg-muted`), `text-gray-500` → `text-fg-muted`, `bg-blue-600 hover:bg-blue-700` → `bg-primary hover:bg-primary-hover`, `text-[10px]`/`text-[11px]` → `text-caption` (12px min).

---

## 5. Testing notes

Pure logic is unit-tested with vitest in the `node` environment:
`hooks/focus-trap-utils.test.ts`, `hooks/api-client.test.ts`, `hooks/api-query-state.test.ts`, `hooks/activity.test.ts`, `components/ui/toast-state.test.ts`.

Component/hook rendering tests would additionally need dev deps
`jsdom` (or `happy-dom`), `@testing-library/react`, `@testing-library/user-event`,
`@testing-library/jest-dom`, plus `environment: "jsdom"` and `include: ["src/**/*.test.{ts,tsx}"]` in `vitest.config.ts`.
