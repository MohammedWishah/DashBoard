# API

Every route the app and the voice assistant use. Back to the [README](../README.md).

All bodies are JSON. Errors always look like `{ "error": { "code": "...", "message": "..." } }`, and the message is written to be read out loud.

Browser routes need `Authorization: Bearer <Supabase access token>` (the app adds it). Missing or invalid: `401`. A section that isn't switched on for the person: `403 feature_disabled`.

## Account routes (signed-in user)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/me` | `{ id, email, isAdmin, features }` |
| GET / POST | `/api/agent-tokens` | POST `{ name }` returns `{ token }` once; only a hash is stored |
| DELETE | `/api/agent-tokens/:id` | revoke |
| GET | `/api/export` | the person's own data as one JSON file |
| POST | `/api/import` | a file from `/api/export`. Validated with Zod (active limit, duplicate ids, every reference), then applied in one D1 transaction with fresh ids. Replaces only the importer's data. Version 1 files (from before Money) replace projects only. |

## Admin routes (OWNER_EMAIL only)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/admin/users` | everyone who has signed in, with their features |
| PATCH | `/api/admin/users/:id` | `{ features: ["money", "planner", "projects", "habits"] }` (any subset) |

## Project routes (signed-in user, Projects switched on)

| Method | Path | Body |
| --- | --- | --- |
| GET | `/api/projects` | |
| POST | `/api/projects` | `{ name, nextAction, doneDefinition?, status? }` (status defaults to `parked`) |
| PATCH | `/api/projects/:id` | any of `{ name, status, nextAction, doneDefinition }` |
| POST | `/api/projects/:id/ship` | `{ note? }` |
| GET | `/api/stats` | returns `{ shippedThisWeek, availableHoursThisWeek, weekStartsAt }` |
| PUT | `/api/settings` | `{ availableHoursThisWeek }` (0 to 168) |

## Money routes (signed-in user, Money switched on)

All take and return integer cents and `YYYY-MM-DD` dates. `?month=YYYY-MM` defaults to the current Berlin month.

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/money/overview?month=` | Totals, categories with spent/upcoming/left, bills, last 10 expenses, income, goals, debts |
| GET | `/api/money/charts?month=` | Pace series, spending by category, last 6 months, debt balances |
| GET / POST | `/api/money/expenses` | `{ categoryId, amountCents, spentOn, note? }` |
| PATCH / DELETE | `/api/money/expenses/:id` | |
| GET / POST | `/api/money/categories` | `{ name, monthlyLimitCents? }` |
| PATCH / DELETE | `/api/money/categories/:id` | PATCH also takes `sortOrder`, `archived`. DELETE returns 409 when in use. |
| GET / POST | `/api/money/bills` | `{ name, categoryId, amountCents, dayOfMonth, startsOn? }` |
| PATCH / DELETE | `/api/money/bills/:id` | DELETE stops the bill; logged expenses stay |
| POST | `/api/money/income` | `{ amountCents, source, receivedOn, note? }` (PATCH / DELETE on `/:id`) |
| GET / POST | `/api/money/goals` | `{ name, targetCents, targetDate? }` (PATCH / DELETE on `/:id`) |
| POST | `/api/money/goals/:id/contributions` | `{ amountCents, onDate }`, negative to take money out. DELETE `/api/money/contributions/:id` |
| GET / POST | `/api/money/debts` | `{ name, startingBalanceCents, startedOn }` (PATCH / DELETE on `/:id`) |
| POST | `/api/money/debts/:id/payments` | `{ amountCents, paidOn }`. DELETE `/api/money/payments/:id` |
| GET / POST | `/api/money/wants` | Want list extra. GET `{ waiting, decided, savedCents }`; POST `{ name, priceCents, url? }` |
| POST | `/api/money/wants/:id/buy` | `{ categoryId, spentOn?, priceCents? }` logs the expense. Twice: 409. |
| POST / DELETE | `/api/money/wants/:id/skip`, `/api/money/wants/:id` | Skip (counts as saved) / remove a mistake |

## Planner routes (signed-in user, Planner switched on)

Dates are Berlin `YYYY-MM-DD`; weeks start on Monday. A check's period is the date (daily), the week's Monday (weekly) or the 1st (monthly).

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/planner/day?date=` | `{ date, today, tasks, habits: { daily, weekly, monthly } }`, each habit with `checked` and `streak`. Defaults to today. |
| PUT | `/api/planner/day/:date/tasks` | `{ tasks: [{ text, done? }] }`, at most 3, replaces the day's top 3 |
| PATCH | `/api/planner/tasks/:id` | `{ text?, done? }` |
| GET | `/api/planner/month?month=` | Daily grid, `dayPercents` for the chart, weekly grid, monthly list, `top` 10 |
| GET / POST | `/api/planner/habits` | POST `{ name, frequency: "daily" \| "weekly" \| "monthly" }`. Names are unique per person (any case). Limits: 50 / 20 / 40 active. |
| PATCH / DELETE | `/api/planner/habits/:id` | PATCH `{ name?, sortOrder?, archived?, tiny?, timeOfDay? }` (`tiny: ""` clears it; `timeOfDay`: morning, afternoon, evening, any). DELETE removes the habit and its history. |
| PUT | `/api/planner/habits/order` | `{ ids: [...] }` sets the order; any id that isn't yours is a 404 |
| PUT / DELETE | `/api/planner/energy/:date` | Energy check-in extra. `{ level: "low" \| "ok" \| "high" }`, one per day (PUT replaces). Future dates: 400. |
| PUT / DELETE | `/api/planner/habits/:id/checks/:period` | Tick / untick. Wrong period key: 400. Future period: 400 `future_period`. Archived habit: 409. Twice is a no-op. |
| GET | `/api/planner/wins?week=` | Wins extra. The week's finished top-3 tasks, habit ticks, shipped projects, no-spend days and skipped buys, with a `total`. `week` is a Monday. |

## Agent routes (voice assistant token)

Create a token in the app: click your email (sidebar, or the person icon on phone) > **Voice assistant** > Create. It's shown once. The assistant then acts as you, with your sections: project routes need Projects, money routes need Money, planner routes need Planner. Revoke a token there any time.

`:ref` is a project id **or its name**, case-insensitive and URL-encoded. They call the same service functions as the browser routes, so the same rules apply.

```bash
BASE=https://project-board.pages.dev
TOKEN=lb_your-token-from-the-app
```

**List all projects**

```bash
curl -s "$BASE/api/agent/projects" \
  -H "Authorization: Bearer $TOKEN"
```

**Next actions for active projects** (short, with a ready-to-speak `speech` string)

```bash
curl -s "$BASE/api/agent/next-actions" \
  -H "Authorization: Bearer $TOKEN"
# {"items":[{"name":"Garden Planner","nextAction":"Wire the frost-date lookup."}],
#  "speech":"Garden Planner: Wire the frost-date lookup."}
```

**Update a project by name**

```bash
curl -s -X PATCH "$BASE/api/agent/projects/garden%20planner" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"nextAction":"Test the planting calendar on my phone."}'
```

**Park or activate a project** (activation returns 409 if both slots are taken)

```bash
curl -s -X PATCH "$BASE/api/agent/projects/Synth%20Firmware" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"parked"}'
```

**Update by id**

```bash
curl -s -X PATCH "$BASE/api/agent/projects/9f125f2c-7586-4607-8b03-13238be70a45" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"active"}'
```

**Log a ship with a note**

```bash
curl -s -X POST "$BASE/api/agent/projects/garden%20planner/ship" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"note":"Frost dates are live"}'
```

**Log a ship without a note** (no body needed)

```bash
curl -s -X POST "$BASE/api/agent/projects/garden%20planner/ship" \
  -H "Authorization: Bearer $TOKEN"
```

**How much money is left this month**

```bash
curl -s "$BASE/api/agent/money/left" \
  -H "Authorization: Bearer $TOKEN"
# {"month":"2026-10","leftCents":107250,"categories":[{"name":"Food","leftCents":8800}],
#  "speech":"You have 1072 euros left this month. Gym has 0 euros left."}
```

The speech names any category at 80% of its limit or over.

**Log an expense** (`amount` is euros; `spentOn` defaults to today, Berlin time)

```bash
curl -s -X POST "$BASE/api/agent/money/expenses" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"category":"food","amount":12.4,"note":"Lidl"}'
# 201 {"expense":{"id":"…","category":"Food","amountCents":1240,"spentOn":"2026-10-06","note":"Lidl"},
#      "speech":"Logged €12.40 in Food. 38 euros left in Food this month."}
```

The category matches your category names, ignoring case. `"Other"` always works (it's created or un-archived if needed). Any other unknown name returns `404 unknown_category` with your names in `error.details.categories`, so the agent can retry with the closest one, or with `Other` and the item as the note.

**Undo** (the id from the reply above)

```bash
curl -s -X DELETE "$BASE/api/agent/money/expenses/EXPENSE_ID" \
  -H "Authorization: Bearer $TOKEN"
# {"speech":"Removed €12.40 from Food."}
```

**Today's plan** (top 3 and what's left to tick)

```bash
curl -s "$BASE/api/agent/planner/today" \
  -H "Authorization: Bearer $TOKEN"
# {..., "speech":"Top 3: Call the bank (done), Finish report. Habits left today: Gym. This week: Clean."}
```

**Tick a habit by name** (today, this week or this month, depending on the habit; `date` optional; DELETE unticks)

```bash
curl -s -X POST "$BASE/api/agent/planner/habits/check" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"habit":"gym"}'
# {"habit":"Gym","frequency":"weekly","period":"2026-10-05","checked":true,"speech":"Ticked Gym for this week. 🔥 2 weeks."}
```

Unknown names return `404 unknown_habit` with `error.details.habits` (name and frequency).

**Set the top 3** (replaces the day's list), then **mark one done** by text or position

```bash
curl -s -X PUT "$BASE/api/agent/planner/tasks" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tasks":["Call the bank","Finish report"]}'

curl -s -X POST "$BASE/api/agent/planner/tasks/done" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"task":"1"}'
# {..., "speech":"Done: Call the bank. 1 of 2 done."}
```

**Want list** (Want list extra; `amount` is euros, `"12,40"` works too)

```bash
curl -s -X POST "$BASE/api/agent/money/wants" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"AirPods","amount":200}'
# {..., "speech":"Added AirPods (€200.00) to your want list. Ask me again in 3 days."}
```

`POST /api/agent/planner/energy` takes `{ "level": "high", "date"? }` (Energy check-in extra).

`POST /api/agent/money/wants/skip` takes `{ "name" }`; `POST /api/agent/money/wants/buy` takes `{ "name", "category", "amount"? }`. Unknown names: `404 unknown_want` with `error.details.wants`.

**Briefing** for Hermes nudge scripts (`morning`, `evening` or `weekly`). An empty `message` means "say nothing", also when the nudges extra is off.

```bash
curl -s "$BASE/api/agent/briefing/morning" \
  -H "Authorization: Bearer $TOKEN"
# {"message":"Good morning. Top 3: not set yet — reply \"top 3: …\".
Habits today: Read, Water."}
```

To set it up in Hermes Agent, see [integrations/hermes/life-board](../integrations/hermes/life-board/SKILL.md).

Locally, use `BASE=http://127.0.0.1:8788` and a token created in your local app.
