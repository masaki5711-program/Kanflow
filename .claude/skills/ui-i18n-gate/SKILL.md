---
name: ui-i18n-gate
description: Confirm the internationalization (i18n) requirement with the user before building any UI, and enforce strict rules for implementing multilingual UI. Supported languages — English, Japanese, Indonesian, Chinese. Use whenever creating or substantially editing UI components, pages, or screens.
origin: project
---

# UI Internationalization (i18n) Gate

Before building any UI, the internationalization requirement **must be confirmed with the user**. This skill defines that confirmation step and the strict rules for implementing multilingual UI.

**Supported languages:** English (`en`), Japanese (`ja`), Indonesian (`id`), Chinese (`zh`). English is the source and fallback language.

The `pre:edit:ui-i18n-check` hook automatically raises this confirmation once per session at the first UI file edit. This skill is the protocol the hook points to.

## When To Use

- before creating or substantially editing any UI — components, pages, screens, dialogs
- whenever the `pre:edit:ui-i18n-check` hook fires

## Step 0 — Confirm with the user (mandatory)

Before writing UI code, ask the user with the `AskUserQuestion` tool. Do not assume.

1. **Is multilingual (i18n) support required for this UI?**
2. If yes, **which of `en` / `ja` / `id` / `zh` must be supported?**

Record the answer. If i18n is **not** required, you may skip the rules below — but still avoid gratuitous hardcoding, since i18n is often added later. If i18n **is** required, the rules below are mandatory.

## Strict Rules — when i18n is required

### 1. No hardcoded user-facing strings

Every string a user can see — labels, buttons, placeholders, headings, tooltips, error / empty / loading / success messages, `aria-label`, image `alt` text — **must** come from an i18n key. Never write a literal user-facing string in markup or logic.

### 2. Key naming

Keys are namespaced, stable, lowercase-dotted: `<feature>.<component>.<element>` — e.g. `order.list.emptyMessage`. A key describes **meaning**, never the English text, so it stays valid when the wording changes.

### 3. Never concatenate translated fragments

Word order differs by language. Never build a sentence by joining translated pieces. Use **one key per complete sentence** with named interpolation placeholders — `t('order.confirmedAt', { date })`, never `t('order.confirmed') + ' ' + date`.

### 4. Interpolation

Pass variables through the i18n library's named-placeholder interpolation (`{name}`, `{count}`). Never `+`-concatenate a variable into translated text.

### 5. Pluralization

Use the i18n library's plural API (ICU plural / `count`). Never hand-write `if (count === 1)` — plural rules differ per language.

### 6. Dates, numbers, currency, units

Format with locale-aware APIs — `Intl.DateTimeFormat` / `Intl.NumberFormat` keyed on the active locale. Never hand-format a date or assume a decimal/thousands separator.

### 7. Completeness — every key in every active locale

Every key **must** exist in all active locale resource files (`en` / `ja` / `id` / `zh`). English is the source of truth and the fallback. A missing translation falls back to English — never to a blank string or the raw key. Missing keys should be caught in review / CI.

### 8. Document language attribute

Set `<html lang="…">` to the active locale so screen readers, hyphenation, and the browser behave correctly.

### 9. Locale is explicit state

The active locale is URL-shareable or persisted state — never hardcoded. Provide a visible way to switch language.

### 10. No text baked into images

User-facing text must not be embedded inside images or icons (untranslatable). Render real text over or beside the graphic.

### 11. Translation file structure

One resource file per locale (`en.json`, `ja.json`, `id.json`, `zh.json`), namespaced to mirror the key structure, keys grouped and sorted for reviewability.

## Execution Instructions

When generating UI:

1. **Confirm** the i18n requirement and target languages with the user (Step 0).
2. **If required** — implement with i18n keys per the strict rules above, and add every new key to **all** active locale files (English first, as the source).
3. **If not required** — note the decision, and still avoid hardcoding strings where i18n is plausibly added later.

## Notes

- The `pre:edit:ui-i18n-check` hook guarantees this confirmation is raised once per session at the first UI edit; this skill is the protocol it enforces.
- Pairs with `frontend-design` and `factory-floor-ui-designer` — confirm i18n here first, then apply those skills for the visual build.
