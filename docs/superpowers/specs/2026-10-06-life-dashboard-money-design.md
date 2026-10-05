# Life Dashboard, Part 1: Shell + Money

Date: 2026-10-06
Status: approved 2026-10-06, built

## Goal

Turn the project board into a personal life dashboard with four sections: **Home, Money, Planner, Habits, Projects**. This spec covers the shell (navigation + Home) and the **Money** section. Planner and Habits get their own specs later. The existing project board becomes the Projects section unchanged.

Success means:

- An expense can be logged on a phone in about 5 seconds.
- Rent, gym and other fixed bills log themselves on their due day.
- At any moment it's clear how much is left this month, overall and per category.
- Charts show spending pace, where money went, the last 6 months, and savings/debt progress.

## Decisions (from brainstorming)

| Topic | Decision |
|---|---|
| Build approach | Extend the existing app: same Cloudflare Pages project, D1 database, Cloudflare Access login |
| Expense entry | Quick manual entry. Recurring bills auto-log. No bank import, no voice logging. |
| Budget style | Monthly limit per category, showing what's left |
| Money extras | Income log, savings goals, debt tracker |
| Charts | Allowed and wanted (lifts the old "no charts" limit). Four charts, listed below. |
| Voice | One read-only route: how much is left this month |
| Currency / time | Euro only, single user, months follow the Europe/Berlin calendar |
| Number format | `en-IE` locale, e.g. `€212.00` (English UI with euros) |

## Scope

**In:** navigation shell, Home screen, Money section (categories, limits, expenses, recurring bills, income, savings goals, debts, 4 charts), Money API, agent "left this month" route, export/import v2, unit tests for money rules.

**Out (not in this spec):** Planner, Habits, bank CSV import, voice expense logging, multiple currencies, receipt photos, notifications, shared budgets.

## Navigation shell

- Routes: `/` Home, `/money`, `/projects`. Planner and Habits are not shown until they're built.
- Client routing with `wouter` (tiny, path-based). Pages serves `index.html` for unknown paths, so deep links work.
- Phone (< 768px): fixed bottom bar with icon + label per section. Desktop: left sidebar.
- The ShaderGradient header band, theme tokens, Geist fonts and single amber accent stay as they are.
- The current board moves to `/projects` with no behavior change.

## Home screen

Cards, top to bottom:

1. **Left this month:** big euro number, with spent/income underneath. Taps through to `/money`.
2. **Next bill:** the next upcoming bill, e.g. "Gym €30.00 in 4 days". Hidden when none are left this month.
3. **Projects:** the active projects' next actions, read-only, with a link to `/projects`.

Planner and Habits cards are added by their own specs.

## Money data model

All amounts are integers in **cents**. Dates are `YYYY-MM-DD` text (local Berlin dates). Timestamps are ISO text, like the existing tables.

| Table | Columns |
|---|---|
| `categories` | `id`, `name` (unique, case-insensitive), `monthly_limit_cents` (nullable = no limit), `sort_order`, `archived` (0/1), `created_at` |
| `expenses` | `id`, `category_id` (FK), `amount_cents` (> 0), `spent_on`, `note` (nullable), `recurring_bill_id` (nullable FK, ON DELETE SET NULL), `created_at` |
| `recurring_bills` | `id`, `name`, `category_id` (FK), `amount_cents` (> 0), `day_of_month` (1 to 31), `starts_on`, `logged_through` (nullable date), `active` (0/1), `created_at` |
| `income` | `id`, `amount_cents` (> 0), `source`, `received_on`, `note` (nullable), `created_at` |
| `savings_goals` | `id`, `name`, `target_cents` (> 0), `target_date` (nullable), `archived`, `created_at` |
| `savings_contributions` | `id`, `goal_id` (FK, cascade), `amount_cents` (positive = added, negative = taken out), `on_date`, `note` |
| `debts` | `id`, `name`, `starting_balance_cents` (> 0), `started_on`, `archived`, `created_at` |
| `debt_payments` | `id`, `debt_id` (FK, cascade), `amount_cents` (> 0), `paid_on`, `note` |

Indexes: `expenses(spent_on)`, `expenses(category_id)`, `income(received_on)`, and a **unique index on `expenses(recurring_bill_id, spent_on)`** that makes bill auto-logging idempotent.

Seeded categories on first migration: Rent, Gym, Food, Transport, Fun, Other (no limits set).

## Money rules

These live in `shared/money.ts` as pure functions so they can be unit tested.

0. **"Today" and "this month"** are always computed in Europe/Berlin on the server (`shared/time.ts`), never from the server's UTC clock. Quick add defaults the date to the browser's Berlin date.
1. **Due date.** A bill's due date in a month is `min(day_of_month, last day of that month)`. Rent on the 31st is due Feb 28 (or 29).
2. **Auto-logging bills.** Before any Money read (overview, charts, expenses list, agent route), the server runs `syncBills(today)`. For every active bill, each due date that is on or after `starts_on`, after `logged_through`, and on or before today becomes an expense with `recurring_bill_id` set; then `logged_through` moves to the last date logged. This catches up if the app wasn't opened for a while, and an auto-logged expense you delete (a skipped month) is never recreated. The unique index plus `ON CONFLICT DO NOTHING` guards against two syncs running at once. *(Added during build: the first draft would have recreated deleted bill expenses.)*
3. **Editing a bill** changes future auto-logged expenses only. Already-logged expenses keep their amount. Deleting a bill sets it inactive, and its logged expenses stay.
4. **Upcoming bill** = active bill whose due date this month is after today.
5. **Left in a category** (current month) = `limit − spent this month − upcoming bills in this category`. For past months: `limit − spent`. Categories without a limit show spent only.
6. **Category bar colors:** normal below 80% of the limit (counting upcoming bills), amber from 80%, red when over.
7. **Month totals:** `left this month = income − expenses − net savings contributions − debt payments`, all within the Berlin calendar month.
8. **Debt balance** = `starting_balance − sum(payments)`, never shown below 0. **Goal progress** = `sum(contributions) / target`.
9. **Deleting a category that has expenses or bills is blocked** (`409 category_in_use`) with a message offering to archive it instead. Archived categories disappear from quick-add chips and stay in history.

## Money screens

**Month header:** `‹ October 2026 ›` month switcher, big "left this month" number, one line of income / spent / saved / debt paid.

**Categories:** one row per category, e.g. "Food €212.00 of €300.00, €88.00 left", with a progress bar colored per rule 6.

**Bills this month:** each bill with its due date and state: logged ✓ or "in N days".

**Recent expenses:** the last 10 for the shown month. Tap to edit or delete. "Show all" expands the month's full list.

**Goals and debts:** one compact card each with progress, an "add money" button (goals) or "log payment" button (debts).

**Quick add** (the 5-second path): a **+** button, fixed on phone and in the header on desktop, opens a sheet. The amount field is focused with `inputmode="decimal"`, then one-tap category chips, date (defaults to today), optional note, then Save. The sheet also has tabs for adding Income.

**Manage menu:** dialogs to add, edit, archive and reorder categories and their limits, and to add, edit and remove recurring bills.

## Charts

Built with shadcn/ui chart components (Recharts underneath). All of them:

- work in dark mode
- fit phone width
- show exact euro values on hover/tap
- stay static under reduced motion

The `dataviz` skill is loaded before writing chart code.

| Chart | Type | Data |
|---|---|---|
| Spending pace | Line | When any limits are set: cumulative spending in **limited categories only**, against a straight "on budget" line from 0 to the sum of their limits. Without limits: total cumulative spending, no budget line. *(Changed during build: counting unlimited rent against the limits made the line look over budget on day 1.)* |
| Where it went | Horizontal bars (sorted) | Spending per category this month |
| Last 6 months | Grouped bars | Income vs expenses per month, the shown month and the 5 before it |
| Savings and debt | Progress per goal + line per debt | Goal progress; debt balance after each payment over time |

## API

New routes under `/api/money/*`, protected the same way as other browser routes (Access + header check). Same patterns as the project routes: Hono, `@hono/zod-validator`, shared Zod schemas, `ApiError` shape, D1 batches for multi-row writes.

| Method | Path | Notes |
|---|---|---|
| GET | `/api/money/overview?month=YYYY-MM` | Runs `syncBills`. Returns totals, categories with spent/upcoming/left, bills with state, last 10 expenses, goals, debts. Defaults to the current month. |
| GET | `/api/money/charts?month=YYYY-MM` | Pace series, by-category, 6-month series, debt series |
| GET / POST | `/api/money/expenses` | GET takes `?month=` |
| PATCH / DELETE | `/api/money/expenses/:id` | |
| GET / POST | `/api/money/categories` | |
| PATCH / DELETE | `/api/money/categories/:id` | DELETE returns 409 when in use |
| GET / POST | `/api/money/bills` | |
| PATCH / DELETE | `/api/money/bills/:id` | DELETE sets inactive |
| GET / POST | `/api/money/income` | GET takes `?month=` |
| PATCH / DELETE | `/api/money/income/:id` | |
| GET / POST | `/api/money/goals` | |
| PATCH / DELETE | `/api/money/goals/:id` | |
| POST | `/api/money/goals/:id/contributions` | |
| DELETE | `/api/money/contributions/:id` | |
| GET / POST | `/api/money/debts` | |
| PATCH / DELETE | `/api/money/debts/:id` | |
| POST | `/api/money/debts/:id/payments` | |
| DELETE | `/api/money/payments/:id` | |

**Agent route (bearer token):** `GET /api/agent/money/left` returns `{ leftCents, month, categories: [{ name, leftCents }], speech }`. The `speech` string covers the total plus any categories over 80%, e.g. "You have 412 euros left this month. Food has 38 euros left."

**Validation:** amounts must be positive and at most €1,000,000. Dates must be real calendar dates, and `month` must be `YYYY-MM`. Names must be 1 to 80 characters.

## Frontend data flow

- TanStack Query keys: `["money", "overview", month]`, `["money", "charts", month]`.
- Every Money mutation invalidates both keys.
- Quick add, edit, delete, contribution and payment use optimistic updates on the overview: they adjust totals and category numbers locally, then roll back with a toast on error, like the project board does today.
- Euro input accepts `12`, `12.5`, `12,50` and is converted to cents on the client. The server only accepts integer cents.

## Export / import

- Export becomes **version 2**: the existing project data plus all Money tables.
- Importing a **v2** file replaces everything in one D1 batch, after Zod checks that every foreign key points to an existing row.
- Importing a **v1** file (projects only) replaces project data and leaves Money data untouched.

## Testing

- Add `vitest`. Unit tests for `shared/money.ts`:
  - due dates for the 29th, 30th and 31st, including February in leap and non-leap years
  - `syncBills` catch-up across several months
  - `syncBills` never logs before `starts_on` and never double-logs
  - left-per-category with and without upcoming bills
  - month totals including negative contributions
  - Berlin month boundaries (an expense at 23:30 on the last day stays in that month)
- Live API checks with curl against local D1, like the project routes got: create, validate, 409s, overview math, agent route.
- Screenshot pass at desktop and 390px width in headless Chrome for Home, Money, quick add and each chart.

## Files (expected)

```
shared/money.ts                 pure rules (due dates, syncBills plan, totals)
shared/money-schemas.ts         Zod schemas + types for money routes
db/schema.ts                    new tables (+ migration 0001_money.sql)
functions/lib/services/money/   overview, charts, crud, sync-bills
functions/lib/routes/money.ts   browser routes
functions/lib/routes/agent.ts   + /money/left
src/routes/home.tsx, money.tsx, projects.tsx
src/components/money/           quick-add, category-rows, bills, goals-debts, manage dialogs, charts/
src/components/app-shell.tsx    sidebar + bottom bar
```

## New dependencies

`wouter` (routing), `recharts` (via shadcn chart), `vitest` (dev).
