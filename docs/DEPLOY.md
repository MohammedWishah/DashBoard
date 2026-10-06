# Deploy cheat sheet

How Life Board gets from this folder to `https://app.mohammedwishah.com` (also `project-board-5ll.pages.dev`).

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

## Every deploy (automatic)

Push to `main`. GitHub Actions (`.github/workflows/deploy.yml`) then:

1. runs typecheck + tests (stops if anything fails, so production stays as it was)
2. applies new migrations to the cloud database
3. builds and deploys

Watch it in the repo's **Actions** tab. To redeploy without a new commit, open **Actions → Deploy → Run workflow**.

Migrations change the database's tables. D1 remembers which ones already ran, so running them on every deploy is safe.

Manual fallback, from your machine:

```
npm run db:migrate:remote
npm run deploy
```

### Auto-deploy setup (one time)

Why Actions and not Cloudflare's "connect to GitHub" button: the Pages project was created with wrangler (Direct Upload), and Cloudflare can't switch those to Git. Actions also runs the migrations, which the button wouldn't.

1. **Cloudflare API token**: dash.cloudflare.com → My Profile → API Tokens → Create Token → Custom. Permissions: *Account · Cloudflare Pages · Edit* and *Account · D1 · Edit*. Copy the token (shown once).
2. **Account ID**: `npx wrangler whoami` prints it.
3. **GitHub secrets**: repo → Settings → Secrets and variables → Actions → New repository secret. Add:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY` (same values as `.env.local`)
4. Push. The first run shows up under **Actions**.

The API token is a real secret. It lives only in GitHub secrets, never in a file.

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
| 8 | In Supabase: **Auth → URL Configuration** | Set **Site URL** to `https://app.mohammedwishah.com` so invite links point at the app. |
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

## Hermes Agent (Telegram)

Log spending by message or voice note: see `integrations/hermes/life-board-money/SKILL.md`. Copy that folder to `~/.hermes/skills/` and put `LIFE_BOARD_URL` and `LIFE_BOARD_TOKEN` in `~/.hermes/.env`.
