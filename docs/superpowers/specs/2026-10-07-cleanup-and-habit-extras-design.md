# Cleanup round + habit extras (tiny version, time of day, energy check-in)

Date: 2026-10-07. Status: approved in chat (user preference: build without plan approval; design questions answered).

## Goal

1. Fix every deferred minor from the Hermes, Planner and Extras reviews in one pass.
2. Add three new **extras**: off by default, toggled per person on People. Each needs Planner.

| Extra key | Label | What it adds |
|---|---|---|
| `tiny_habits` | Tiny versions | An optional "tiny version" text per habit (max 80), shown under the habit. Ticking it is the same tick. |
| `time_of_day` | Time of day | Each habit has `morning` / `afternoon` / `evening` / `any` (default `any`). Today groups daily habits under those headings. The morning brief lists morning habits first. |
| `energy` | Energy check-in | One level per day: `low` / `ok` / `high`, from chips at the top of Today (and Home's Today card), or from Hermes ("energy high"). After enough data, Wins and the weekly brief show the habit whose completion differs most between high and low energy days. |

## Data (migration `0006`)

- `habits` gains:
  - `tiny` (text, nullable)
  - `time_of_day` (text, default `'any'`)
  - `archived_at` (text, nullable; set when archived, cleared when restored)
- New table `energy_checkins`:
  - `user_id`, `day` (date), `level` (`low` | `ok` | `high`), `updated_at`
  - PK `(user_id, day)`
- `categories`: unique index on `(user_id, lower(name))`. This closes the parallel-"Other" race. A clash on insert becomes `409 name_taken`. For the Other fallback, it re-reads the existing row.

## Rules (pure, unit-tested)

**`energyInsight(days, habits, today)`**, in `shared/energy.ts`:

- **Window:** the last 60 days up to today.
- **Needs:** at least 14 check-ins, with at least 3 `high` days and at least 3 `low` days.
- **Per daily habit:** the completion rate on high days and on low days. Only days on or after the habit was created count, and the habit needs at least 3 eligible days in each group.
- **Result:** the habit with the largest absolute difference, if that difference is at least 20 points: `{ habit, highPct, lowPct }`. Otherwise `null`.
- **Text:**
  - `"On high-energy days you do Read 82% of the time, on low days 40%."`
  - When low > high: `"On low-energy days you do Read more (60%) than on high days (30%)."`

**`dayPercents`:** a habit counts on a day when `createdOn <= day` and (it isn't archived, or `day < archivedOn`). Archiving no longer rewrites past chart days.

## API

**Planner:**
- Habit create and update take `tiny?` (string or null, max 80) and `timeOfDay?`.
- `PUT /api/planner/habits/order` takes `{ ids: string[] }` and sets `sortOrder` by array index. It covers only the caller's habits; unknown ids give 404. The manage dialog uses it instead of swapping.
- `PUT /api/planner/energy/:date` takes `{ level }`; `DELETE /api/planner/energy/:date` clears it.
  - Requires the `energy` extra.
  - Future dates give 400.
  - `GET /planner/day` adds `energy: level | null` (null when the extra is off).

**Agent:** `POST /api/agent/planner/energy` takes `{ level, date? }` and replies `{ speech: "Logged energy: high for today." }`. Requires the `energy` extra.

**Wins:** `GET /planner/wins` adds:
- `insight: string | null`, only with the `energy` extra
- `habits[].possible`: the eligible days that week (daily habits) or 1 (weekly)

**Briefings:**
- **Morning,** with `time_of_day` on: `"Morning habits: X. Later: Y."` instead of `"Habits today: …"`. Habits set to `any` count as "Later".
- **Evening,** with `energy` on and no check-in yet today: adds the last line `Energy today? Reply "energy low", "ok" or "high".` The evening message is no longer silent when only that line applies, so it's sent on days when nothing else is open.
- **Weekly:**
  - habit counts show `count/possible`
  - "1 win" is singular
  - the insight line is added when present

**Export/import:**
- `money.wants` is optional in version 3 and is always written by export.
- `planner.energy` is optional and is always written by export.
- On import, a section present in the file replaces that section; an absent section leaves it untouched.
- Want `expenseId` is remapped when the expense is in the file, otherwise set to null.
- Habit checks are validated: the `period` must match the habit's frequency.

## Cleanup list

**Money and Hermes:**
1. The Want list joins backups (above).
2. Want **Skip** and **×**: the row hides at once and a 5-second toast with **Undo** appears. The API call happens only after 5 seconds. Buttons get item-specific accessible names ("Skip AirPods").
3. Buy dialog: the default category is applied once categories have loaded.
4. `buyWant`: roll back to waiting only if creating the expense fails. If linking fails, the expense stays and the want stays bought.
5. `speakEuro` under €1 says "less than 1 euro" instead of "0 euros".
6. The categories unique index (above), plus isolation checks:
   - a new Other is created when none exists
   - an archived category that isn't Other gives 404
7. Hermes `SKILL.md`: wrap free text in single quotes, and write `'\''` for an apostrophe, so `$5` and backticks survive.
8. Cron scripts:
   - The `.env` parser accepts `export KEY=value` and strips ` # comments` after unquoted values.
   - HTTP 401/403 prints `Life Board: token rejected (401) — create a new one in Voice assistant and update ~/.hermes/.env`, instead of "unreachable".

**Planner:**

9. Fast double clicks on one box: toggles for the same habit and period run in order (TanStack mutation `scope`).
10. Archived habits keep their past chart days (`archived_at`).
11. Reorder uses the order endpoint, so it's reliable even when two habits share a `sortOrder`.
12. While the next day or month loads, the old one is visibly dimmed **and not clickable** (`pointer-events-none`, `aria-busy`).
13. Import checks period keys (above).
14. Wins card: on a past week, the empty text reads "Nothing logged that week."

**People:**

15. Toggle PATCHes run in order (mutation `scope`), so two quick clicks can't undo each other.

**Isolation script:**

16. Reading `.body` properties uses optional chaining where a failure would otherwise crash the script.
17. At the end, the script resets the stable owner's extras to `[]`.

## Testing

**Unit:**
- `energyInsight`: below threshold, too few high or low days, picks the largest difference, the low > high wording, habits created mid-window
- `dayPercents` with an archive cutoff
- `speakEuro` under €1
- briefing: morning time-of-day grouping, evening energy line (and silence when energy is logged and nothing is open), weekly "1 win" and `count/possible`
- export schema: `wants` and `energy` optional; a weekly check on a Tuesday is rejected

**Isolation:**
- energy routes 403 when the extra is off; another user can't read or write your energy
- the order endpoint rejects another user's ids
- habit `tiny` and `timeOfDay` round-trip
- the Other creation and archived-category checks (above)
- export v3 includes wants and energy; import restores them
