# Setup

Run Life Board yourself: login, local development and a manual deploy. For the automatic deploy and how the pieces fit, see [DEPLOY.md](DEPLOY.md). Back to the [README](../README.md).

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

Open http://localhost:5173 and sign in with your Supabase account, or click **Try as guest**. Vite proxies `/api` to the Functions on `:8788`.

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

Short version with explanations: [DEPLOY.md](DEPLOY.md). The steps below are the manual path.

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
