# Adding i18n keys

`@/lib/i18n` is a barrel (`src/lib/i18n.ts` → `src/lib/i18n/index.ts`). Public API is unchanged:
`getTranslations`, `Translations`, `Language`, `languageLabels`, point-unit helpers.

Every domain file contains **one interface + `ja` / `en` / `id` objects** for its keys.
The objects are typed with the interface, so a key missing in any language (or an extra key) is a
compile error. `index.ts` merges all domains into the full `Translations` type.

## How to add a key

1. Pick the domain file for your page area (table below). **Only edit your own domain file.**
2. Add `myNewKey: string` to the interface.
3. Add the value to `ja`, `en` and `id` in the same file (same position keeps diffs readable).
4. Use it as `t.myNewKey` (via `useLanguage()` / `getTranslations(lang)`).
5. Run `npx tsc --noEmit` and `npx vitest run src/lib/i18n`.

Rules:
- Key names must be globally unique (all domains are spread into one object). Prefix with the
  domain (`backlogXxx`, `sprintXxx`, ...). A test fails if a key exists in two domain files.
- No empty strings (test-enforced). Indonesian must be real Indonesian (e.g. "Backlog Produk",
  not "Product Backlog"). Product terms stay as-is where established: `IceBox`, `PBI`, `Sprint`.
  For a title that shows the bare product term, pair it with an explanation
  (see `iceboxDescription`: ja "アイデア置き場（IceBox）", en "Idea box (IceBox)", id "Kotak Ide (IceBox)").
- Do not edit `index.ts` unless you create a new domain file (then add the import, the
  `extends` entry, the `domains` entry and the three spreads).
- Existing keys that are used across pages live in `common.ts`; only touch it for truly shared words.

## Domain file → page area

| File | Page area / components | Key prefixes |
|------|------------------------|--------------|
| `common.ts` | Shared buttons/states, error pages (`error.tsx`), roles, point units, member picker, bilingual-text badges (`i18n-text.tsx`) | `save`, `cancel`..., `error*`, `role{PO,SM,Dev}`, `pointUnit*`, `memberPicker*`, `translation{Pending,Busy,Done,Failed,NowHint}`, `glossaryHint*` |
| `nav.ts` | Sidebar / header | `nav*` |
| `auth.ts` | `/login` | `login*` |
| `projects.ts` | Top page (`top-page.tsx`), project list/create (`project-list.tsx`) | `project*`, `top*` |
| `me.ts` | `/me` profile, personal fixed tasks (`fixed-tasks-modal.tsx`) | `myProfile*`, `fixedTasks*` |
| `dashboard.ts` | `projects/[id]` dashboard, attachments, folders | `dashboard*`, `folder*` |
| `icebox.ts` | `projects/[id]/icebox` | `icebox*` |
| `backlog.ts` | `projects/[id]/backlog` | `backlog*` |
| `backlog-ops.ts` | Backlog daily operations: PBI modal link, URL filters, drag & drop, bulk actions, undo, done paging | `backlog*` (ops keys) |
| `plan.ts` | `projects/[id]/plan` (master plan) | `plan*` |
| `releases.ts` | `projects/[id]/releases` | `release*` |
| `sprints.ts` | `projects/[id]/sprints` list/create/edit, PBI import | `sprint*` (not below) |
| `sprint-tasks.ts` | Sprint tasks, task modal, daily scrum, burndown (`burndown/`) | `task*`, `sprintTask*`, `sprintDailyScrum*`, `burndown*`, `completionToIcebox*` |
| `sprint-review.ts` | Sprint review dialog, retrospective/KPT, archive | `sprintReview*`, `sprintRetrospective*`, `sprintKpt*`, `sprint*Archive*` |
| `sprint-board.ts` | Sprint kanban board + view/filter toolbar (`sprints/components/board/`) | `sprintBoard*` |
| `calendar.ts` | `projects/[id]/calendar`, event modals | `calendar*`, `event*` |
| `gantt.ts` | `projects/[id]/gantt` | `gantt*` |
| `report.ts` | `projects/[id]/report`, AI report documents | `report*`, `aiReport*` |
| `ai.ts` | `projects/[id]/chat`, AI assist buttons (INVEST, retro, PBI draft, generate) | `chat*`, `ai*` (not `aiReport*`) |
| `guide.ts` | `projects/[id]/guide` | `guide*` |
| `settings.ts` | `projects/[id]/settings` (incl. sprint history table) | `settings*`, `col*` |
| `admin-users.ts` | `/admin` user management (`user-management-inline.tsx`) | `user*` |
| `admin-org.ts` | Sections admin, `/settings/categories` | `section*`, `roleSectionManager`, `category*` |
| `admin-glossary.ts` | Admin glossary + translation queue | `glossary*`, `translations*` |
| `trash.ts` | Project trash, admin project trash, "move to trash" wording | `trash*` |
| `comments.ts` | Comment thread / composer (`components/comments/`), PBI detail tabs, change history | `comments*`, `history*` |
| `insights.ts` | Dashboard top rows (sprint pulse, my tasks, coming up, activity feed), home KPIs / inline task status / lazy archived list, burndown sprint selector, velocity chart, IceBox undo | `dashboardPulse*`, `dashboardMyTasks*`, `dashboardDue*`, `dashboardFeed*`, `top{Kpi,Task,Archived,Retry}*`, `burndownSprint*`, `velocity*`, `iceboxUndo` |
| `project-organize.ts` | Home project list organizing: card / list layout, by-role grouping, dormant reminder, bulk archive (`_project-list/`) | `projectLayout*`, `projectGroup*`, `projectListCol*`, `projectDormantBanner*`, `projectBulkArchive*` |
| `chat-proposals.ts` | `projects/[id]/chat` approval cards of AI write proposals (`proposal-card.tsx`) | `chatProposal*` |
| `ai-extensions.ts` | P3: chat history sidebar (`chat/thread-list.tsx`), background AI report jobs (dashboard button chip, reports panel), AI surveillance settings (`settings/surveillance-section.tsx`) | `chatThread*`, `chatNewChat`, `aiJob*`, `surv*` |
| `search.ts` | Global search / command palette (`components/search/`), keyboard shortcuts help (`components/shortcuts/`) | `search*`, `shortcuts*` |
| `notifications.ts` | Header notification bell / panel, notification settings on `/me` (`components/notifications/`) | `notif*` |
| `excel-io.ts` | Excel export buttons, backlog import dialog (`components/excel/`), sheet / column names of the server-built workbooks (`services/excel/`) | `excel*` |
| `portfolio.ts` | Department portfolio `/portfolio` (KPI strip, filters, table) and its header link | `portfolio*` |
| `api-tokens.ts` | Personal access tokens on `/me` (`me/api-tokens-section.tsx`), admin token list (`admin/api-tokens/`) | `apiToken*` |
| `admin-metrics.ts` | Admin metrics dashboard (`admin/metrics/`) | `metrics*` |

Keep each file under ~400 lines; if a domain grows past that, split it (e.g. `backlog-detail.ts`)
and register the new file in `index.ts`.
