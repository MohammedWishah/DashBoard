# Multi-user with email + password (Supabase Auth)

Date: 2026-10-06
Status: built 2026-10-06. Added during build: admin roles and per-person features (see README "Accounts and roles").

## Goal

Each person logs in with their own email and password and sees only their own projects and money. Done before Planner and Habits so those are built multi-user from the start.

## Decisions

| Topic | Decision |
|---|---|
| Passwords | **Supabase Auth** handles sign in, password storage, forgot-password and invite emails. Supabase stores **no app data**; everything stays in Cloudflare D1. |
| Who can join | **Invite only.** Sign-ups are disabled in Supabase; the owner invites people from the Supabase dashboard. The invite email lets them set a password. |
| Cloudflare Access | Removed from the browser app (it would mean logging in twice). Agent routes keep using bearer tokens. |
| Email delivery | Supabase's built-in sender only reaches the project's team members, 2 per hour. Inviting others needs custom SMTP (e.g. Resend free tier). Documented in the README. |
| Existing data | Kept. It belongs to whoever logs in with `OWNER_EMAIL` first. |

## How a request is authenticated

1. The browser gets a session from Supabase (`@supabase/supabase-js`) and sends `Authorization: Bearer <access token>` on every `/api` call.
2. The API verifies the token with `jose`:
   - asymmetric keys (default for new Supabase projects): public keys from `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`, cached per isolate
   - `HS256` only when `SUPABASE_JWT_SECRET` is set (legacy projects, and local tests)
   - issuer must be `${SUPABASE_URL}/auth/v1`, audience `authenticated`, not expired
3. `sub` (Supabase user id) and `email` identify the user. On the first request a `users` row is created and the 6 starter categories are seeded. If the email equals `OWNER_EMAIL`, all rows with an empty `user_id` (data from before this change) are assigned to them.
4. Every service function receives `userId`. Every query filters on it, and every insert sets it.

Any failure returns `401 unauthorized`; the UI then signs out and shows the login screen.

## Data changes (migration 0002)

- New `users`: `id` (Supabase user id), `email`, `created_at`.
- New `agent_tokens`: `id`, `user_id`, `name`, `token_hash` (SHA-256, unique), `created_at`, `last_used_at`. The plain token is shown once.
- `user_id text NOT NULL DEFAULT ''` added to all 11 data tables, with an index on each. Child tables (`shipped_events`, `savings_contributions`, `debt_payments`) carry it too, so every table filters the same way.
- `settings` primary key becomes `(user_id, key)`.
- Rules become per user: max 2 active projects, unique project and category names, settings, starter categories.

## Agent / voice assistant

- The single `AGENT_TOKEN` secret is replaced by per-user tokens created in the app (sidebar menu, "Voice assistant").
- Token format `lb_<43 url-safe chars>`. The API hashes the presented token and looks it up; the matching row gives the user.
- Agent routes and responses are unchanged.

## Export / import

- Export contains only the signed-in user's rows, without `user_id` (same v2 format as before).
- Import replaces only the signed-in user's data, and **gives every row a new id** (keeping references intact), so importing a file can never collide with another user's rows.

## Frontend

- Auth gate in front of the whole app:
  - "Sign in" screen: email, password, "Forgot password"
  - "Forgot password": sends the reset email
  - "Set a new password": shown after an invite or reset link
- The sidebar (and phone header) shows the user's email with a menu: Voice assistant tokens, Sign out.
- Signing out clears the query cache.
- New env for the frontend: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (public by design).

## New API routes (signed-in user)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/me` | `{ id, email }` |
| GET | `/api/agent-tokens` | list (no secrets) |
| POST | `/api/agent-tokens` | `{ name }` returns `{ token }` once |
| DELETE | `/api/agent-tokens/:id` | revoke |

## Testing

- Existing unit tests keep passing.
- `scripts/isolation-check.mjs` runs against the local dev API. It mints HS256 tokens for two users and checks:
  - user B never sees, edits, ships or deletes user A's projects, expenses, bills, goals or debts
  - B's ids return 404 for A
  - both users can have a project and a category with the same name
  - each user has their own 2-active limit
  - agent tokens only reach their owner's data
  - the owner claims the legacy data on first login
- Screenshots of the auth screens on desktop and phone.
