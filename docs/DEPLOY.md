# Deploy cheat sheet

How Life Board gets from this folder to `https://project-board.pages.dev`.

## The picture

```
Browser (React app, built into dist/)
   │  logs in with Supabase → gets a token
   ▼
Cloudflare Pages Functions (functions/, the Hono API)
   │  checks the token against SUPABASE_URL
   ▼
D1 database (all your data: projects, money, ...)
```

- **Cloudflare Pages** hosts the site (`dist/`) and runs the API (`functions/`).
- **D1** is Cloudflare's cloud SQLite. `npm run dev` uses a local copy in `.wrangler/`.
- **Supabase** handles login only. No data lives there.
- **wrangler** is Cloudflare's CLI. Every Cloudflare command goes through it.

## Every deploy (after the first)

```
npm run db:migrate:remote   # only if a new file appeared in db/migrations/
npm run deploy              # builds dist/, uploads dist/ + functions/
```

Migrations change the database's tables. D1 remembers which ones already ran, so running it again is safe.

## One-time setup

| # | Command / action | What it does |
|---|---|---|
| 1 | `npx wrangler login` | Lets wrangler act on your Cloudflare account. Check with `npx wrangler whoami`. |
| 2 | `npx wrangler d1 create project-board` | Creates the cloud database. Copy the printed `database_id` into `wrangler.toml`. |
| 3 | Fill `[vars]` in `wrangler.toml` | `SUPABASE_URL` (backend checks logins against it) and `OWNER_EMAIL` (who is admin). |
| 4 | Copy `.env.example` to `.env.local` and fill it | `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`. Vite bakes these into the frontend at build time. |
| 5 | `npm run db:migrate:remote` | Creates the tables in the cloud database. |
| 6 | `npx wrangler pages project create project-board --production-branch main` | Creates the hosting slot. |
| 7 | `npm run deploy` | Builds and uploads. Prints the live URL. |
| 8 | In Supabase: **Auth → URL Configuration** | Set **Site URL** to `https://project-board.pages.dev` so invite links point at the app. |
| 9 | In Supabase: **Auth → Users → Invite user** | Invite yourself (same email as `OWNER_EMAIL`), set a password, sign in. |

Where the Supabase values are: **Project Settings → API**.

- **Project URL** is the bare address, for example `https://abcd1234.supabase.co`. Don't add `/rest/v1/`: the backend appends its own paths, so login would break.
- **Publishable key** (also called "anon public") goes in `.env.local`.

The backend and frontend are set up separately because they run in different places. The backend reads `wrangler.toml` on Cloudflare's servers. The frontend reads `.env.local` once, at build time, and then runs in the browser.

## Secret or not?

| Value | Where | Safe in git? |
|---|---|---|
| `SUPABASE_URL` | `wrangler.toml`, `.env.local` | Yes, it's public |
| Publishable / anon key | `.env.local` | Public by design, but kept out of git anyway (`*.local`) |
| `database_id` | `wrangler.toml` | Yes, it's useless without your Cloudflare login |
| `OWNER_EMAIL` | `wrangler.toml` | Personal, not secret. Fine while the repo is private. If you make the repo public, move it to `npx wrangler pages secret put OWNER_EMAIL` and delete it from `[vars]`. |
| Supabase **secret / service_role** key | nowhere | **Never.** This app doesn't need it. |
| `SUPABASE_JWT_SECRET` | `.dev.vars` only, for the isolation test script | **Never.** |
| Local database | `.wrangler/` | **No.** It holds your real data. |

`.gitignore` already covers `.dev.vars`, `*.local`, `.wrangler`, `dist` and `node_modules`.

## When something breaks

- **"You are not authenticated"**: run `npx wrangler login`.
- **Login works locally but not live**: check `SUPABASE_URL` in `wrangler.toml`, then redeploy.
- **"no such table"**: run `npm run db:migrate:remote`.
- **Blank page, auth errors in the console**: `.env.local` was missing or wrong at build time. Fix it, then run `npm run deploy` again.
