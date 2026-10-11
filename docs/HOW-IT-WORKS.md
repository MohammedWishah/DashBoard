# How it works

The rules behind each section, who can see what, and the design choices. Back to the [README](../README.md).

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
- **Private data:** each person only ever sees their own projects, money and planner. `scripts/isolation-check.mjs` proves it (100+ checks).
- **Admin:** the person whose email is `OWNER_EMAIL`. They have every section, own the data from before accounts existed, and get a **People** page to choose what each person can use.
- **Defaults:** new people get **Money** and **Planner**. **Projects** stays admin-only until you switch it on for someone. (Habits live inside Planner.) The API enforces this too, not just the menu.
- **Extras:** small optional helpers, **off for everyone by default** (the admin too). Switch them on per person on People: *Today on Home*, *Forgiving streaks* (one missed day doesn't break a streak), *Wins* (this week's finished things), *Want list* (a cooling-off queue for impulse buys: under €50 waits a day, up to €200 three days, more a week) *Hermes nudges* (morning, evening and Sunday messages), *Tiny versions* (a fallback like "1 page" under a habit), *Time of day* (habits grouped morning / afternoon / evening) and *Energy check-in* (low / ok / high once a day, with a pattern line in Wins after a few weeks). An extra only works while its section is on.
- **Guest mode:** **Try as guest** on the sign-in screen opens Money (with the Want list) without an account. The real API runs in the browser on a local SQLite database (sql.js, built from `db/migrations`), saved in `localStorage`. Nothing reaches the server. Guests can download a backup and restore it into a real account later. The code is `functions/lib/guest.ts` and `src/lib/guest*.ts`, loaded only when someone starts a guest session.

## Design notes

Dark only, by design. Tokens follow the Vercel/Geist language from [awesome-design-md](https://github.com/VoltAgent/awesome-design-md): Geist and Geist Mono, monochrome neutrals, hairline borders, one 8px radius scale. The only UI accent is emerald, used for Ship buttons and progress. Charts use the dataviz reference palette (blue for spending, orange for income), checked for color-blind safety against the dark card surface; warning/over states use reserved status colors and always come with an icon and label. Every chart has a Table view. The header band is a [ShaderGradient](https://github.com/ruucm/shadergradient) water plane in two emerald greens. It loads lazily (three.js is its own chunk), stops animating under `prefers-reduced-motion`, and falls back to a static CSS gradient without WebGL.
