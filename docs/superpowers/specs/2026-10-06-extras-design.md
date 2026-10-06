# Extras: nudges, Today on Home, forgiving streaks, wins, want list (+ quick wins)

Date: 2026-10-06. Status: approved in chat, awaiting spec review.

## Goal

Add five research-backed helpers for an ADHD brain without making the app busier:

1. **Hermes nudges**
2. **Today on Home**
3. **Forgiving streaks**
4. **Wins**
5. **Want list**

Each one is an **extra**: off by default, switched on per person from the admin's People page. A set of always-on quick fixes ships alongside.

Why each extra exists:

- **Hermes nudges:** reminders that come from outside, in an app the user already watches.
- **Today on Home:** "out of sight is out of mind".
- **Forgiving streaks:** one miss shouldn't trigger a shame spiral; "never miss twice".
- **Wins:** the Progress Principle; visible small wins.
- **Want list:** delay discounting and impulse buys ("ADHD tax").

**Success:**

- With every extra off, the app looks and behaves exactly as it does today.
- With an extra on, it adds one focused thing in one place.

## Decisions from the brainstorm

| Question | Decision |
|---|---|
| Scope | All five extras plus the quick wins, in one spec and one plan |
| Build order | Quick wins, then streaks, Home, wins, want list, nudges |
| Want-list wait | By price: under €50 waits 24 h; €50 to €200 waits 3 days; over €200 waits 7 days |
| Visibility | Each extra is a per-person toggle on the People page, the admin included, default off |
| Nudge times | 08:00 morning, 21:00 evening (silent when nothing is left), Sunday 19:00 weekly. The user can change them in Hermes. |

## 1. Extras and toggles

`shared/features.ts` gains a second list:

```ts
export const EXTRAS = ["home_today", "kind_streaks", "wins", "wants", "nudges"] as const;
export type Extra = (typeof EXTRAS)[number];
export const EXTRA_LABELS: Record<Extra, string> = {
  home_today: "Today on Home",
  kind_streaks: "Forgiving streaks",
  wins: "Wins",
  wants: "Want list",
  nudges: "Hermes nudges",
};
/** The section an extra lives in. It only works while that section is on. */
export const EXTRA_REQUIRES: Record<Extra, Feature | null> = {
  home_today: "planner",
  kind_streaks: "planner",
  wins: "planner",
  wants: "money",
  nudges: null,
};
```

**Storage.** Extras are stored in the same `users.features` JSON array as sections, so no migration is needed. `effectiveFeatures` keeps returning sections only. A new function, `effectiveExtras(stored, sections)`, returns the stored extras whose required section is in `sections`. **The admin is not special for extras:** they get only what's stored for them.

**API.**

- `GET /api/me` adds `extras: Extra[]`.
- Middleware sets `c.get("extras")` for both browser and agent requests.
- `requireExtra(extra)` returns `403 extra_disabled` for routes that only exist for an extra (want list, wins, briefing). Briefing is the exception: it returns an empty message instead, see section 6.
- `GET /api/admin/users` adds `extras` per person.
- `PATCH /api/admin/users/:id` takes `{ features?: Feature[], extras?: Extra[] }`, with at least one of the two.
  - On **someone else:** both allowed, as today for features.
  - On **yourself (admin):** only `extras`. `features` on self stays `400`.
  - Stored value: sections plus extras, de-duplicated.

**UI.** On the People page, each person's row gets a second chip group, **Extras**, under Sections.

- A chip whose required section is off for that person is disabled, with the hint "Needs Planner" or "Needs Money".
- The admin's own extras chips are enabled.
- The UI reads `me.extras`; a `useHasExtra(extra)` hook mirrors `useHasFeature`.

## 2. Today on Home (`home_today`)

When on, Home shows a **Today** card first, above the money hero:

- the top 3 (the existing `TopThree` component: edit and tick)
- today's habits: daily, plus this week's and this month's not yet ticked (the existing checklist; ticked items dim but stay)
- a link "Open Planner"

It reuses `useDay(today)`. When the extra is off, Home is unchanged. Home's "Nothing is switched on" message also counts Planner as a section.

## 3. Forgiving streaks (`kind_streaks`)

A new pure rule in `shared/planner.ts`:

**`kindStreak(f, checked, today)`:**

- Walk back from the current period, or the previous one if the current one isn't ticked.
- Count ticked periods. A **single** missed period between ticks is skipped (it doesn't count, it doesn't break).
- **Two misses in a row** end the streak.
- Monthly: 0.

**`atRisk(f, checked, today)`:** true when the previous period was missed, the current one isn't ticked yet, and the period before the miss was ticked. In other words, "tick today to keep it".

**`total`:** all-time number of ticks for the habit.

**Server.**

- `getDay` and `getMonth` take `kind: boolean`, which is true when the caller has the extra.
- With `kind`, `streak` uses `kindStreak`, and each habit row adds `total` and `atRisk`.
- Without `kind`, rows carry `total: null, atRisk: false` and the classic streak.
- The agent tick speech uses the same rule.

**UI (only with the extra).**

- An at-risk habit shows an amber dot (`text-status-warning`, with a label, not colour alone) and the line "Missed yesterday · tick today to keep 12". Weekly habits say "last week".
- The month grid's streak column shows the streak.
- The habit name gets a small "· 47 done" label.

## 4. Wins (`wins`)

**`GET /api/planner/wins?week=YYYY-MM-DD`** (a Monday; defaults to this week) returns:

```ts
{
  week: string; // Monday
  days: string[]; // Mon..Sun
  tasksDone: { day: string; text: string }[];
  habits: { name: string; frequency: Frequency; count: number }[]; // ticks inside the week, count > 0
  shipped: { project: string; note: string | null; day: string }[]; // only when Projects is on
  noSpendDays: string[]; // only when Money is on: days up to today with no expense except bill expenses
  skipped: { name: string; priceCents: number; day: string }[]; // only when Want list is on
  total: number; // tasksDone + sum(habit counts) + shipped + noSpendDays + skipped
}
```

The pure helpers go in `shared/wins.ts`: `noSpendDays(days, expenseDays, today)`, `winsTotal(...)` and `weeklySummary(...)` (for the nudge text).

**UI:** a "Wins" card on the Planner page, under the Today card. It shows the big number, then a grouped list. Each group is hidden when empty. "‹ ›" switches the week. With no wins yet it says "Nothing yet this week. Tick one thing and it shows up here."

## 5. Want list (`wants`)

**Migration `0005_wants.sql`, table `wants`:**

| Column | Notes |
|---|---|
| `id` | text PK |
| `user_id` | owner |
| `name` | 1 to 120 chars |
| `price_cents` | > 0, <= `MAX_AMOUNT_CENTS` |
| `url` | nullable, `http(s)` only, max 500 |
| `created_at` | ISO |
| `ready_at` | ISO = `created_at` + wait |
| `status` | `waiting` \| `bought` \| `skipped` |
| `decided_at` | nullable ISO |
| `expense_id` | nullable FK to expenses, `on delete set null` |

`waitHours(priceCents)` lives in `shared/money.ts`: `< 5000` → 24, `<= 20000` → 72, else 168.

**Routes** (`requireFeature("money")` plus `requireExtra("wants")`):

| Method | Path | Notes |
|---|---|---|
| GET | `/api/money/wants` | `{ waiting[], decided[] (last 20), savedCents }`. `savedCents` is the sum of skipped prices, all time. |
| POST | `/api/money/wants` | `{ name, priceCents, url? }` |
| POST | `/api/money/wants/:id/buy` | `{ categoryId, spentOn?, priceCents? }`. Creates the expense (note = the item name), sets `bought` and `expense_id`. Before `ready_at` it still works; the UI confirms first. |
| POST | `/api/money/wants/:id/skip` | Sets `skipped` |
| DELETE | `/api/money/wants/:id` | Removes a mistaken entry; it doesn't count as saved |

Decided items can't be bought or skipped again: `409 already_decided`.

**Agent routes** (`/api/agent/money/wants…`, same gates). Items are matched by name, ignoring case and spacing, among **waiting** items:

| Method | Path | Notes |
|---|---|---|
| POST | `/api/agent/money/wants` | `{ name, amount }` (euros, same rules as the expense route). Speech: "Added AirPods (€200.00) to your want list. Ask me again in 3 days." |
| POST | `/api/agent/money/wants/skip` | `{ name }`. Speech: "Skipped AirPods. Saved €200.00 by waiting." |
| POST | `/api/agent/money/wants/buy` | `{ name, category, amount? }`. The category resolves like the expense route, including the Other fallback. Speech: "Bought AirPods: logged €200.00 in Fun." |

Unknown names return `404 unknown_want` with `details.wants`.

**UI:** a "Want list" card on the Money page, next to Goals.

- Add form: name, price, optional link.
- Waiting rows show "ready in 2 days", or **Buy / Skip** when ready.
- An early Buy shows the dialog "Still 2 days to go. Buy anyway?".
- Buy opens a small category picker (default: the last used category, else Other).
- The "Saved by waiting" total sits in the card header.

## 6. Hermes nudges (`nudges`)

**`GET /api/agent/briefing/:kind`**, where `kind` is `morning`, `evening` or `weekly`, returns `{ message: string }`. `message` is `""` when there's nothing to say **or the extra is off**, so a Hermes script job stays silent. It's never a 403. The text is built by pure functions in `shared/briefing.ts`, unit-tested on fixed inputs.

**Morning:** sections are left out when empty. Example:

```
Good morning. Top 3: not set yet — reply "top 3: …".
Habits today: Read, Water. This week: Gym.
Bills: Rent €900.00 due tomorrow.
Ready to decide: AirPods (€200.00).
```

- Bills: due today or tomorrow and not yet logged, when Money is on.
- Ready wants: when the Want list is on.
- If every part is empty: "Good morning. Nothing scheduled, enjoy the day."

**Evening:** only unfinished things:

- top-3 items not done
- daily habits not ticked
- at-risk streaks: "Read missed yesterday, tick today to keep 12", when Forgiving streaks is on

When all of these are empty: `""`.

**Weekly:** wins total and its top groups, daily-habit average % for the week, money left this month, and saved by waiting. It's built from the same data as `GET /planner/wins` and the money overview. Example:

```
Week in review: 23 wins. Top 3 done 9×, Read 6/7, shipped Garden Planner, 3 no-spend days.
Money: €412.00 left this month. Saved by waiting: €200.00.
```

Sections whose source is off are left out.

**Hermes side:** `integrations/hermes/life-board/cron/` holds three tiny stdlib Python scripts: `life_board_morning.py`, `life_board_evening.py`, `life_board_weekly.py`.

- Each one reads `LIFE_BOARD_URL` and `LIFE_BOARD_TOKEN` from the process environment, falling back to parsing `$HERMES_HOME/.env` (default `~/.hermes/.env`). This is needed because Hermes cron scripts don't inherit `.env`.
- Each one calls its briefing kind and prints `message`, or nothing.
- On a network error, each prints one line: "Life Board unreachable: …".

`SKILL.md` and `docs/DEPLOY.md` explain the setup:

- copy the three files to `~/.hermes/scripts/`
- create the jobs with:

```
hermes cron create "0 8 * * *"  --no-agent --script life_board_morning.py --deliver telegram --name life-board-morning
hermes cron create "0 21 * * *" --no-agent --script life_board_evening.py --deliver telegram --name life-board-evening
hermes cron create "0 19 * * 0" --no-agent --script life_board_weekly.py  --deliver telegram --name life-board-weekly
```

The Hermes host's timezone must be Europe/Berlin, or the user adjusts the hours. The docs say so.

The Python client also gains `brief morning|evening|weekly` and the want commands `want --name --amount`, `want-skip --name` and `want-buy --name --category [--amount]`.

## 7. Quick wins (always on)

1. **Installable app:**
   - `public/manifest.webmanifest`: name "Life Board", `display: standalone`, dark `background_color`/`theme_color` `#0b0b0c`, `start_url: "/"`, icons 192/512 and maskable.
   - PNG icons generated from `favicon.svg`.
   - `apple-touch-icon`, `apple-mobile-web-app-capable` and `apple-mobile-web-app-status-bar-style` meta tags in `index.html`.
   - No service worker: there are no offline or push needs, since Telegram does the nudging.
2. **Top-3 autosave:** save 800 ms after typing stops, as well as on blur, through the same queued mutation.
3. **Long habit names:** grid name cells wrap the text in a `max-w-36 truncate` block element with `title` set to the full name.
4. **Past-period labels:** on a day outside the current week, the Today card says "That week" instead of "This week". Outside the current month it says "That month".
5. **Archived habits can't be ticked:** `setCheck` returns `409 habit_archived`.
6. **"12,40" from Hermes:**
   - The agent expense, want and buy routes accept `amount` as a number, or as a string matching `^\d+([.,]\d{1,2})?$`.
   - In a string, a comma is read as the decimal point.
   - The Python client normalises `,` to `.` before sending.

## Testing

**Unit tests (vitest):**

- `kindStreak` and `atRisk`:
  - a single gap is skipped
  - a double gap ends it
  - today unticked isn't a miss
  - weekly habits
  - at-risk on/off cases
- `waitHours` at the tier edges: 4999, 5000, 20000 and 20001 cents.
- `noSpendDays`: bill expenses don't count as spending, future days are excluded, empty weeks are handled.
- `winsTotal`.
- Briefing texts:
  - morning with every section, and with nothing
  - evening silent when done, and with at-risk lines
  - weekly with sections left out
- `effectiveExtras`: required section off, and admin with no stored extras.
- The amount parser: `"12,40"`, `"12.4"`, `"12,345"` rejected, `"abc"` rejected.

**Isolation checks:**

- Admin can toggle their own extras but not their own features. A non-admin can't toggle anything.
- With `wants` off: `/money/wants` → 403, and the agent want routes → 403.
- With `nudges` off: briefing → `{ message: "" }`.
- Another user can't see, buy, skip or delete your wants (404). `unknown_want` lists only your own wants.
- Buy creates exactly one expense in your account. A second buy → 409.
- Ticking an archived habit → 409.
- Wins for Bob never include the owner's tasks or shipped projects.
- Agent expense with `"amount": "12,40"` → 1240 cents.
