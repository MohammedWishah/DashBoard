# Planner: today's top 3 and a habit tracker

Date: 2026-10-06. Status: approved in chat, awaiting spec review.

## Goal

Give Life Board one page for everything checked daily: today's top 3 tasks and habits. The look takes after the [Alibubucrafts habit tracker template](https://www.etsy.com/listing/1756912502/habit-tracker-excel-template-daily):

- daily, weekly and monthly habits
- a daily progress chart
- a top-10 habits list

It's built in Life Board's own visual language (dark, Geist, emerald accent). Hermes can tick habits, set the top 3 and read the plan back.

**Success:** the user opens Planner (or messages Hermes) and, in under 10 seconds, sees today's top 3, what's left to tick, and how the month is going.

**Out of scope:**
- time blocks
- top-3 carry-over (each day starts empty; past days stay as a record)
- reminders or notifications
- Home page widgets
- habit targets beyond "once per period"

## Decisions from the brainstorm

| Question | Decision |
|---|---|
| Page shape | One Planner page: Today card on top, Month section below |
| Habit kinds | Daily, weekly and monthly, as three grids |
| Unfinished top 3 | Nothing carries over |
| Hermes | Included in this build |
| Access | Behind the `planner` feature. The `habits` feature is removed. |

## Data (migration `0004_planner.sql`)

All dates are Berlin calendar dates (`YYYY-MM-DD`), as in Money. Every table has `user_id` and an index on it.

**`habits`**

| Column | Notes |
|---|---|
| `id` | text PK (UUID) |
| `user_id` | owner |
| `name` | 1 to 80 chars, unique per user across all frequencies, ignoring case and spacing (same rule as categories). That way "did gym" is never ambiguous. |
| `frequency` | `daily` \| `weekly` \| `monthly` |
| `sort_order` | integer |
| `archived` | boolean, default false |
| `created_at` | ISO datetime |

Limits on active (non-archived) habits are 50 daily, 20 weekly and 40 monthly. Going over returns `409 habit_limit`.

**`habit_checks`**: one row per tick.

| Column | Notes |
|---|---|
| `habit_id` | FK to habits |
| `user_id` | owner |
| `period` | daily: the date; weekly: that week's Monday; monthly: the 1st of the month |
| `created_at` | ISO datetime |

The primary key is `(habit_id, period)`, so ticking twice is a no-op.

**`day_tasks`**: the top 3.

| Column | Notes |
|---|---|
| `id` | text PK |
| `user_id` | owner |
| `day` | date |
| `position` | 1 to 3; unique `(user_id, day, position)` |
| `text` | 1 to 200 chars |
| `done` | boolean |
| `created_at` | ISO datetime |

**Rules (pure functions in `shared/planner.ts`, unit-tested):**

- **`periodFor(frequency, date)`:** the period key for a date. Weeks start on Monday. A week that crosses months belongs to its Monday's date.
- **Future periods can't be ticked.** Ticking a period after the current Berlin period returns 400 `future_period`. Past periods can be changed.
- **Streak:**
  - Daily: consecutive ticked days ending today, or ending yesterday if today isn't ticked yet.
  - Weekly: the same, counted in weeks.
  - Monthly: no streak.
- **Month percentages:**
  - Per daily habit: ticked days ÷ days elapsed this month (the whole month for past months), counting only days since the habit was created.
  - Per weekly habit: ticked weeks ÷ weeks (Mondays in the month) that have started, counting only weeks since the habit was created.
  - Per day, for the progress chart: daily habits ticked that day ÷ daily habits that existed and weren't archived on that day.
- **Top habits:** the 10 daily and weekly habits with the highest month percentage. Ties go to the longer streak, then to the name.

## API

Browser routes need the `planner` feature (`requireFeature("planner")` on `/planner/*` and `/agent/planner/*`). All bodies are JSON and every query is scoped by `user_id`.

| Method | Path | Notes |
|---|---|---|
| GET | `/api/planner/day?date=` | `{ date, tasks[], habits: { daily[], weekly[], monthly[] } }`. Each habit has `checked` for that date's period and `streak`. Defaults to Berlin today. |
| PUT | `/api/planner/day/:date/tasks` | `{ tasks: [{ text, done }] }`, at most 3, replaces that day's list (positions are taken from array order) |
| PATCH | `/api/planner/tasks/:id` | `{ done?, text? }` |
| GET | `/api/planner/month?month=` | `{ month, daily: [{ habit, checks: date[], percent, streak }], dayPercents: [{ date, percent \| null }], weekly: [{ habit, weeks: { monday, checked }[] }], monthly: [{ habit, checked }], top: [...] }` |
| GET / POST | `/api/planner/habits` | POST `{ name, frequency }` |
| PATCH / DELETE | `/api/planner/habits/:id` | PATCH `{ name?, sortOrder?, archived? }`. DELETE removes the habit and its checks; the UI offers Archive first. |
| PUT / DELETE | `/api/planner/habits/:id/checks/:period` | Tick or untick. `period` must be the right key for the habit's frequency, otherwise 400. |

**Agent routes** (agent token, `planner` feature):

| Method | Path | Notes |
|---|---|---|
| GET | `/api/agent/planner/today` | Same data as `day`, plus `speech`, e.g. "Top 3: Call the bank (done), Finish report. Habits left today: Gym, Water. This week: Clean." |
| POST | `/api/agent/planner/habits/check` | `{ habit, date? }`. `habit` is matched by name, ignoring case and spacing, across non-archived habits. The period comes from the habit's frequency and `date` (default today). Unknown names: `404 unknown_habit` with `details.habits` (names and frequency). Replies `{ speech: "Ticked Gym for today. 🔥 3 days." }`. |
| DELETE | `/api/agent/planner/habits/check` | Same body; unticks. |
| PUT | `/api/agent/planner/tasks` | `{ tasks: string[], date? }` (1 to 3) replaces the top 3 |
| POST | `/api/agent/planner/tasks/done` | `{ task, date? }` matches the text, ignoring case and spacing, or by position "1" to "3" |

## UI

The route is `/planner`, wrapped in `<Gate feature="planner">`, lazy-loaded like Money, with a sidebar entry.

**Today card**
- Date header with ‹ / Today / › to move between days.
- Top 3: three rows with a checkbox and an inline text field. Saves on blur or Enter.
- Habits: today's daily habits with checkboxes and streak, plus "This week" and "This month" checklists for the current periods.
- Count `n/m` of daily habits done.

**Month section**, with ‹ › to change month.
- **Daily grid:**
  - one row per habit and one column per day
  - % and streak columns
  - squares are emerald when ticked
  - future days are disabled
  - today's column is outlined
- **Progress chart** under the grid: bars of each day's %. It uses the existing chart setup, with a Table view toggle like the Money charts.
- **Weekly grid:** the habits by the weeks whose Monday falls in the month.
- **Monthly list:** each habit with this month's checkbox.
- **Top habits:** a ranked list of up to 10 with %.
- **Manage habits:** a small dialog to add, rename, reorder, archive and delete, grouped by frequency.

**Phone:** the Today card comes first, and the grids scroll sideways inside their card (the page itself never scrolls sideways). Ticking uses optimistic updates with TanStack Query.

## Hermes

The skill folder `integrations/hermes/life-board-money` becomes `integrations/hermes/life-board`. It's one skill covering money and planner, with the same two environment variables. `life_board.py` gains these commands:

- `plan` (today)
- `check --habit X [--date]`
- `uncheck --habit X [--date]`
- `top3 "A" "B" "C" [--date]`
- `done --task X [--date]`

On `unknown_habit`, the skill tells the agent to pick the closest name from the list or ask; it never creates habits. The docs (README, DEPLOY.md) point to the new folder.

## Export and import

Export becomes version 3 and adds `planner: { habits, checks, tasks }`. Import accepts versions 1 to 3. A version 3 file also replaces planner data. Version 1 and 2 files leave planner data untouched. All rows get fresh ids, as today.

## Feature flag change

`habits` is removed from `FEATURES`, and `planner` is added to `BUILT_FEATURES`. Stored `"habits"` strings in `users.features` are already ignored by `effectiveFeatures`. `scripts/isolation-check.mjs` changes its "admin has every feature" count from 4 to 3.

## Testing

**Unit tests (`shared/planner.test.ts`):**
- `periodFor`: Monday weeks, a Sunday, a week crossing months and years, months.
- Streaks: today unticked, a gap, weekly streaks.
- Month and day percentages: a habit created mid-month, an archived habit, a past month, a month with no habits.
- Top-10 ranking and tie-break order.
- Future-period detection.

**Isolation checks:**
- Another user can't see, tick or edit your habits or tasks, through the browser or through the agent.
- `unknown_habit` lists only your own habits.
- Planner switched off gives 403 for both browser and agent.
- Double tick is a no-op.
- Future tick gives 400.
- Top 3 is limited to 3.
