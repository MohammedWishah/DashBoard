# Life Board

A personal life dashboard with three sections:

- **Home:** what's left this month, the next bill, and your active projects' next actions.
- **Money:** expenses, monthly category limits, recurring bills that log themselves, income, savings goals, debts, and charts.
- **Projects:** a side-project board. At most two projects are active, each shows one concrete next action, stale projects surface on their own, and shipped work is counted per week.

Several people can use it, each with their own private data and an email + password login. The admin decides who gets which section. A voice assistant can read and update it over HTTPS with a per-person token. Planner and Habits are planned as later sections (see `docs/superpowers/specs/`).

**Stack:** React + Vite + TypeScript, Tailwind CSS v4, shadcn/ui (Radix) incl. charts (Recharts), TanStack Query, wouter, date-fns · Hono on Cloudflare Pages Functions · Cloudflare D1 with Drizzle ORM · Supabase Auth (login only) with `jose` token checks · Zod schemas shared between UI and API · Vitest · ShaderGradient (react-three-fiber) for the header band.

```
src/          React app. routes/ = pages, components/money/ = Money UI, hooks/ = TanStack Query + optimistic updates
functions/    Pages Functions. api/[[route]].ts mounts the Hono app from functions/lib/
db/           Drizzle schema (schema.ts) and SQL migrations (migrations/)
shared/       Zod schemas, types, and pure rules used by both sides (money.ts has unit tests)
docs/         Design specs
```

## Money rules

| Rule | Detail |
| --- | --- |
| Amounts are whole cents | The UI accepts `12`, `12.5`, `12,50`, `1.234,56` and converts. The API only takes integer cents. |
| Months follow Berlin time | "Today" and "this month" are Europe/Berlin calendar dates, never the server's UTC clock. |
| Bills log themselves | On its due day a recurring bill becomes an expense. If the app wasn't opened, it catches up. A bill on the 31st lands on the last day of shorter months. |
| Deleted bill expenses stay deleted | Each bill remembers the last due date it logged, so deleting one (a skipped month) never brings it back. |
| Left in a category | Limit − spent − upcoming bills this month. Amber from 80%, red when over, always with an icon and label. |
| Left this month | Income − expenses − money put into savings − debt payments. |
| Categories in use can't be deleted | The API returns `409 category_in_use`; the UI archives them instead, keeping history. |

## Project rules

| Rule | Where |
| --- | --- |
| Max 2 projects with status `active` | Server returns `409 active_limit`. The UI warns and disables "Active" before you hit it. |
| Any change to a project updates `last_touched` | Every PATCH and every ship. A weekly review counts as a change. |
| Stale = `last_touched` older than 30 days | `shared/time.ts`. API responses include `stale: true/false`. |
| Shipped this week = events since Monday 00:00 Europe/Berlin | `shared/time.ts`, handles daylight saving. |
| Project names are unique (ignoring case and extra spaces) | Server returns `409 name_taken`. The voice assistant looks projects up by name. |

Archived projects don't appear in any tab. They stay in the database and in exports.

## Accounts and roles

- **Login:** everyone signs in with email + password. [Supabase Auth](https://supabase.com/docs/guides/auth) stores the passwords and sends the invite and reset emails. Supabase stores **no app data**; that all stays in Cloudflare D1.
- **Invite only:** sign-ups are off. You invite people from the Supabase dashboard.
- **Private data:** each person only ever sees their own projects and money. `scripts/isolation-check.mjs` proves it (53 checks).
- **Admin:** the person whose email is `OWNER_EMAIL`. They have every section, own the data from before accounts existed, and get a **People** page to choose what each person can use.
- **Defaults:** new people get **Money** and **Planner**. **Projects** and **Habits** stay admin-only until you switch them on for someone. The API enforces this too, not just the menu.

## Set up Supabase (login only)

1. Create a free project at [supabase.com](https://supabase.com).
2. **Project Settings > API:** copy the **Project URL** and the **publishable key** (called "anon" key in older projects).
3. **Authentication > Sign In / Providers > Email:**
   - turn **off** "Allow new users to sign up" (invite only)
   - keep Email enabled
4. **Authentication > URL Configuration:**
   - **Site URL:** your app's address, e.g. `https://project-board.pages.dev`
   - **Redirect URLs:** add the same address, plus `http://localhost:5173` for local use
5. **Invite yourself first:** Authentication > Users > **Invite user** with your `OWNER_EMAIL`. Open the email, choose a password.
6. **Before inviting anyone else**, add custom SMTP (Authentication > Emails > SMTP Settings), for example [Resend](https://resend.com)'s free tier. Supabase's built-in sender only delivers to your own Supabase team and only 2 emails per hour, so invites and password resets wouldn't reach other people.

To add a person later: Supabase > Authentication > Users > Invite user. After their first sign-in they appear on **People**, where you switch sections on or off.

## Local development

Needs Node 20+.

```bash
npm install
cp .env.example .env.local              # VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY
cp .dev.vars.example .dev.vars          # SUPABASE_URL + OWNER_EMAIL for the local API
npm run db:migrate:local                # creates the local D1 database in .wrangler/
npm run dev                             # wrangler pages dev on :8788 + Vite on :5173
```

Open http://localhost:5173 and sign in with your Supabase account. Vite proxies `/api` to the Functions on `:8788`.

Other scripts:

```bash
npm run typecheck        # frontend + functions
npm test                 # unit tests for the money rules (vitest)
npm run build            # production build into dist/
npm run preview          # build, then serve dist/ + functions together on :8788
npm run db:generate      # after editing db/schema.ts: writes a new SQL migration
node scripts/isolation-check.mjs   # privacy + roles checks against the local API (see below)
```

The isolation check signs its own test tokens. Set `SUPABASE_JWT_SECRET=any-long-string` in `.dev.vars`, restart `npm run dev:api`, then run it. Leave that secret out in production.

## Deploy to Cloudflare Pages

Short version with explanations: [docs/DEPLOY.md](docs/DEPLOY.md).

1. **Log in**

   ```bash
   npx wrangler login
   ```

2. **Create the D1 database**

   ```bash
   npx wrangler d1 create project-board
   ```

   Copy the printed `database_id` into `wrangler.toml`, replacing the zeros.

3. **Set the Supabase vars** in `wrangler.toml` under `[vars]`:
   - `SUPABASE_URL`: your Project URL
   - `OWNER_EMAIL`: your email (this makes you admin)

4. **Run migrations** locally and remotely (run the remote one again after every update that adds a migration)

   ```bash
   npm run db:migrate:local
   npm run db:migrate:remote
   ```

5. **Create the Pages project**

   ```bash
   npx wrangler pages project create project-board --production-branch main
   ```

6. **Build with the frontend Supabase values and deploy.** `.env.local` (from step "Local development") is read at build time:

   ```bash
   npm run deploy
   ```

   The app is now at `https://project-board.pages.dev`. Sign in with the account you invited in Supabase.

If you set up Cloudflare Access for the earlier version, remove those Access applications in Zero Trust. Login now happens in the app, and Access would make everyone sign in twice.

## API

All bodies are JSON. Errors always look like `{ "error": { "code": "...", "message": "..." } }`, and the message is written to be read out loud.

Browser routes need `Authorization: Bearer <Supabase access token>` (the app adds it). Missing or invalid: `401`. A section that isn't switched on for the person: `403 feature_disabled`.

### Account routes (signed-in user)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/me` | `{ id, email, isAdmin, features }` |
| GET / POST | `/api/agent-tokens` | POST `{ name }` returns `{ token }` once; only a hash is stored |
| DELETE | `/api/agent-tokens/:id` | revoke |
| GET | `/api/export` | the person's own data as one JSON file |
| POST | `/api/import` | a file from `/api/export`. Validated with Zod (active limit, duplicate ids, every reference), then applied in one D1 transaction with fresh ids. Replaces only the importer's data. Version 1 files (from before Money) replace projects only. |

### Admin routes (OWNER_EMAIL only)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/admin/users` | everyone who has signed in, with their features |
| PATCH | `/api/admin/users/:id` | `{ features: ["money", "planner", "projects", "habits"] }` (any subset) |

### Project routes (signed-in user, Projects switched on)

| Method | Path | Body |
| --- | --- | --- |
| GET | `/api/projects` | |
| POST | `/api/projects` | `{ name, nextAction, doneDefinition?, status? }` (status defaults to `parked`) |
| PATCH | `/api/projects/:id` | any of `{ name, status, nextAction, doneDefinition }` |
| POST | `/api/projects/:id/ship` | `{ note? }` |
| GET | `/api/stats` | returns `{ shippedThisWeek, availableHoursThisWeek, weekStartsAt }` |
| PUT | `/api/settings` | `{ availableHoursThisWeek }` (0 to 168) |

### Money routes (signed-in user, Money switched on)

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

### Agent routes (voice assistant token)

Create a token in the app: click your email (sidebar, or the person icon on phone) > **Voice assistant** > Create. It's shown once. The assistant then acts as you, with your sections: project routes need Projects, money routes need Money. Revoke a token there any time.

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
curl -s -X POST "$BASE/api/agent/money/expenses"   -H "Authorization: Bearer $TOKEN"   -H "Content-Type: application/json"   -d '{"category":"food","amount":12.4,"note":"Lidl"}'
# 201 {"expense":{"id":"…","category":"Food","amountCents":1240,"spentOn":"2026-10-06","note":"Lidl"},
#      "speech":"Logged €12.40 in Food. 38 euros left in Food this month."}
```

The category matches your category names, ignoring case. `"Other"` always works (it's created or un-archived if needed). Any other unknown name returns `404 unknown_category` with your names in `error.details.categories`, so the agent can retry with the closest one, or with `Other` and the item as the note.

**Undo** (the id from the reply above)

```bash
curl -s -X DELETE "$BASE/api/agent/money/expenses/EXPENSE_ID"   -H "Authorization: Bearer $TOKEN"
# {"speech":"Removed €12.40 from Food."}
```

To set it up in Hermes Agent, see [integrations/hermes/life-board-money](integrations/hermes/life-board-money/SKILL.md).

Locally, use `BASE=http://127.0.0.1:8788` and a token created in your local app.

## Design notes

Dark only, by design. Tokens follow the Vercel/Geist language from [awesome-design-md](https://github.com/VoltAgent/awesome-design-md): Geist and Geist Mono, monochrome neutrals, hairline borders, one 8px radius scale. The only UI accent is emerald, used for Ship buttons and progress. Charts use the dataviz reference palette (blue for spending, orange for income), checked for color-blind safety against the dark card surface; warning/over states use reserved status colors and always come with an icon and label. Every chart has a Table view. The header band is a [ShaderGradient](https://github.com/ruucm/shadergradient) water plane in two emerald greens. It loads lazily (three.js is its own chunk), stops animating under `prefers-reduced-motion`, and falls back to a static CSS gradient without WebGL.
