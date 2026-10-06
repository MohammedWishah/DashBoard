# Hermes Expense Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Hermes Agent log and undo Money expenses by category name through the agent API.

**Architecture:** Pure helpers (euros to cents, name matching) go in `shared/money.ts` with vitest tests. A new service, `functions/lib/services/money/agent.ts`, resolves the category (including the Other fallback), reuses `createExpense`/`deleteExpense`, and builds the speech. Two routes are added to `functions/lib/routes/agent.ts`. A Hermes skill folder with a stdlib Python client lives in `integrations/hermes/`.

**Tech Stack:** Hono on Cloudflare Pages Functions, Drizzle + D1, Zod, Vitest, Python 3 stdlib (Hermes side).

**Spec:** `docs/superpowers/specs/2026-10-06-hermes-expense-logging-design.md`

## Global Constraints

- Agent `amount` is euros (number), > 0, <= 100000, at most 2 decimals. Stored as integer cents.
- `spentOn` defaults to `berlinToday()`. Dates are `YYYY-MM-DD`.
- `note`: trimmed, max 500, nullable/optional (reuse the money `note` schema).
- Category match: trimmed, case- and whitespace-insensitive (`normalizeName`), non-archived only, first by sort order.
- Unknown category: `404 unknown_category`, `error.details.categories` = non-archived names of the caller only.
- Every query is scoped by `userId`. Another user's id gives 404.
- Errors keep the existing `{ error: { code, message, details? } }` shape.
- Speech for a logged amount uses `formatEuro` (shows cents). Amounts left/over use `speakEuro`.

## Review Focus

1. "Other" exists but is archived. Expect it to be un-archived and used, not a 409 `name_taken`. Pinned in Task 3 (isolation check).
2. Float amounts like `12.4`, `0.1 + 0.2` and `19.99` must store exactly 1240 / 30 / 1999. `12.345` must be rejected, not rounded. Pinned in Task 1.
3. Two categories whose names differ only by case or spacing ("food", " Food "). The first by sort order wins. Pinned in Task 1.
4. An expense dated last month must not produce a "left this month" sentence. Guarded by the month comparison in Task 2, pinned in Task 3 (Food gets a limit first so the sentence would otherwise appear).
5. A note with quotes or apostrophes ("McDonald's") from Hermes must arrive intact. The Python client builds JSON, pinned in Task 4's manual check.

---

### Task 1: Pure helpers and agent schema

**Files:**
- Modify: `shared/money.ts` (add helpers next to `formatEuro`, ~line 150)
- Modify: `shared/money-schemas.ts` (add schema after `expenseUpdateSchema`, line 34; type near line 76)
- Test: `shared/money.test.ts`

**Interfaces:**
- Produces:
  - `MAX_AGENT_AMOUNT_CENTS = 10_000_000`
  - `OTHER_CATEGORY_NAME = "Other"`
  - `eurosToCents(euros: number): number | null`
  - `findCategoryByName<T extends { name: string }>(cats: T[], name: string): T | undefined`
  - `agentExpenseCreateSchema`
  - `type AgentExpenseCreate = { category: string; amount: number; spentOn?: string; note?: string | null }`

- [ ] **Step 1: Write the failing tests** (append to `shared/money.test.ts`, and add `eurosToCents, findCategoryByName` to its import list)

```ts
describe("eurosToCents", () => {
  it("converts euros with up to 2 decimals exactly", () => {
    expect(eurosToCents(50)).toBe(5000);
    expect(eurosToCents(12.4)).toBe(1240);
    expect(eurosToCents(19.99)).toBe(1999);
    expect(eurosToCents(0.1 + 0.2)).toBe(30);
    expect(eurosToCents(0.01)).toBe(1);
    expect(eurosToCents(100000)).toBe(10_000_000);
  });
  it("rejects zero, negatives, over the max and sub-cent amounts", () => {
    expect(eurosToCents(0)).toBeNull();
    expect(eurosToCents(-5)).toBeNull();
    expect(eurosToCents(100000.01)).toBeNull();
    expect(eurosToCents(12.345)).toBeNull();
    expect(eurosToCents(Number.NaN)).toBeNull();
    expect(eurosToCents(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("findCategoryByName", () => {
  const cats = [
    { id: "a", name: "Food" },
    { id: "b", name: "Eating  Out" },
    { id: "c", name: "food" },
  ];
  it("ignores case and extra spaces, first match wins", () => {
    expect(findCategoryByName(cats, "FOOD")?.id).toBe("a");
    expect(findCategoryByName(cats, "  eating out ")?.id).toBe("b");
  });
  it("returns undefined when nothing matches", () => {
    expect(findCategoryByName(cats, "Gifts")).toBeUndefined();
    expect(findCategoryByName([], "Food")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests and see them fail**

Run: `npx vitest run shared/money.test.ts`
Expected: FAIL, `eurosToCents is not a function` / not exported.

- [ ] **Step 3: Implement in `shared/money.ts`**

Add this import at the top, after the header comment:

```ts
import { normalizeName } from "./rules";
```

Add after `formatEuro`:

```ts
/** Largest single expense an agent may log: €100,000. */
export const MAX_AGENT_AMOUNT_CENTS = 10_000_000;
export const OTHER_CATEGORY_NAME = "Other";

/** Euros from an agent (e.g. 12.4) to cents. Null when not positive, over the max, or finer than a cent. */
export function eurosToCents(euros: number): number | null {
  if (!Number.isFinite(euros) || euros <= 0) return null;
  const cents = Math.round(euros * 100);
  if (Math.abs(cents - euros * 100) > 1e-6) return null;
  return cents > MAX_AGENT_AMOUNT_CENTS ? null : cents;
}

/** First category (in the given order) whose name matches, ignoring case and extra spaces. */
export function findCategoryByName<T extends { name: string }>(cats: T[], name: string): T | undefined {
  const key = normalizeName(name);
  return cats.find((c) => normalizeName(c.name) === key);
}
```

- [ ] **Step 4: Add the schema to `shared/money-schemas.ts`**

Change the import on line 2 to:

```ts
import { MAX_AMOUNT_CENTS, eurosToCents, type BarState, type PacePoint } from "./money";
```

After `expenseUpdateSchema` (line 34):

```ts
/** Voice agents speak euros, not cents: { category: "Food", amount: 12.4 }. */
export const agentExpenseCreateSchema = z.object({
  category: z.string().trim().min(1, "Category is required").max(80),
  amount: z
    .number()
    .refine((n) => eurosToCents(n) !== null, "Amount must be euros from 0.01 to 100000, with at most 2 decimals"),
  spentOn: dateSchema.optional(),
  note,
});
```

Next to the other `z.infer` types (~line 76):

```ts
export type AgentExpenseCreate = z.infer<typeof agentExpenseCreateSchema>;
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `npx vitest run shared/money.test.ts && npm run typecheck`
Expected: all tests PASS (36 old plus the new ones), typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add shared/money.ts shared/money-schemas.ts shared/money.test.ts
git commit -m "Money: euro/category helpers and agent expense schema"
```

---

### Task 2: Agent expense service and routes

**Files:**
- Modify: `functions/lib/services/money/crud.ts` (export `getCategory` line 46, `getExpense` line 111)
- Create: `functions/lib/services/money/agent.ts`
- Modify: `functions/lib/routes/agent.ts`

**Interfaces:**
- Consumes (Task 1): `eurosToCents`, `findCategoryByName`, `OTHER_CATEGORY_NAME`, `AgentExpenseCreate`, `agentExpenseCreateSchema`
- Produces:
  - `logAgentExpense(db: Db, userId: string, input: AgentExpenseCreate, now?: Date): Promise<{ expense: { id: string; category: string; amountCents: number; spentOn: string; note: string | null }; speech: string }>`
  - `undoAgentExpense(db: Db, userId: string, id: string): Promise<{ speech: string }>`
  - Routes: `POST /api/agent/money/expenses` (201), `DELETE /api/agent/money/expenses/:id` (200)

- [ ] **Step 1: Export the two lookups in `crud.ts`**

Change `async function getCategory(` to `export async function getCategory(`, and `async function getExpense(` to `export async function getExpense(`. Nothing else changes.

- [ ] **Step 2: Create `functions/lib/services/money/agent.ts`**

```ts
import {
  OTHER_CATEGORY_NAME,
  berlinMonth,
  berlinToday,
  eurosToCents,
  findCategoryByName,
  formatEuro,
  speakEuro,
} from "../../../../shared/money";
import type { AgentExpenseCreate } from "../../../../shared/money-schemas";
import { normalizeName } from "../../../../shared/rules";
import type { Db } from "../../db";
import { ApiError } from "../../errors";
import {
  createCategory,
  createExpense,
  deleteExpense,
  getCategory,
  getExpense,
  listCategories,
  updateCategory,
} from "./crud";
import { getOverview } from "./overview";

// Voice-agent side of Money. The agent (Hermes) does the language work and sends a
// category name; this file matches it, falls back to Other, and writes the reply.

async function resolveCategory(db: Db, userId: string, requested: string) {
  const all = await listCategories(db, userId);
  const active = all.filter((c) => !c.archived);
  const match = findCategoryByName(active, requested);
  if (match) return match;

  if (normalizeName(requested) === normalizeName(OTHER_CATEGORY_NAME)) {
    // An archived Other would make a new one clash on name, so bring it back instead.
    const archived = findCategoryByName(all.filter((c) => c.archived), OTHER_CATEGORY_NAME);
    if (archived) {
      await updateCategory(db, userId, archived.id, { archived: false });
      return { ...archived, archived: false };
    }
    return createCategory(db, userId, { name: OTHER_CATEGORY_NAME });
  }

  throw new ApiError(
    404,
    "unknown_category",
    `No category named "${requested}". Retry with the closest of these, or with "${OTHER_CATEGORY_NAME}" and the item as the note.`,
    { categories: active.map((c) => c.name) },
  );
}

export async function logAgentExpense(db: Db, userId: string, input: AgentExpenseCreate, now = new Date()) {
  const category = await resolveCategory(db, userId, input.category);
  const amountCents = eurosToCents(input.amount)!; // the schema already rejected anything else
  const spentOn = input.spentOn ?? berlinToday(now);
  const expense = await createExpense(db, userId, { categoryId: category.id, amountCents, spentOn, note: input.note });

  const parts = [`Logged ${formatEuro(amountCents)} in ${category.name}.`];
  if (category.monthlyLimitCents !== null && spentOn.slice(0, 7) === berlinMonth(now)) {
    const left = (await getOverview(db, userId, undefined, now)).categories.find((c) => c.id === category.id)?.leftCents;
    if (left != null) {
      parts.push(
        left >= 0
          ? `${speakEuro(left)} left in ${category.name} this month.`
          : `${category.name} is ${speakEuro(-left)} over this month.`,
      );
    }
  }

  return {
    expense: { id: expense.id, category: category.name, amountCents, spentOn, note: expense.note },
    speech: parts.join(" "),
  };
}

export async function undoAgentExpense(db: Db, userId: string, id: string) {
  const expense = await getExpense(db, userId, id);
  const category = await getCategory(db, userId, expense.categoryId);
  await deleteExpense(db, userId, id);
  return { speech: `Removed ${formatEuro(expense.amountCents)} from ${category.name}.` };
}
```

- [ ] **Step 3: Add the routes in `functions/lib/routes/agent.ts`**

Add these imports:

```ts
import { agentExpenseCreateSchema } from "../../../shared/money-schemas";
import { logAgentExpense, undoAgentExpense } from "../services/money/agent";
```

Replace the last route (the comment plus `.get("/money/left", ...)`) with:

```ts
  // "How much is left this month?"
  .get("/money/left", async (c) => c.json(await getMoneyLeft(getDb(c.env.DB), c.get("userId"))))
  // "50 euro food". Category by name; Other is created on first use.
  .post("/money/expenses", validate("json", agentExpenseCreateSchema), async (c) =>
    c.json(await logAgentExpense(getDb(c.env.DB), c.get("userId"), c.req.valid("json")), 201),
  )
  // "Undo that", with the id from the POST reply.
  .delete("/money/expenses/:id", async (c) =>
    c.json(await undoAgentExpense(getDb(c.env.DB), c.get("userId"), c.req.param("id"))),
  );
```

`requireFeature("money")` already covers `/agent/money/*` in `functions/lib/app.ts:26`. No change is needed there.

- [ ] **Step 4: Typecheck and run unit tests**

Run: `npm run typecheck && npm test`
Expected: clean, all PASS.

- [ ] **Step 5: Smoke test against the local API**

Run `npm run dev:api` in the background. Create an agent token in the local app (or reuse the isolation-check token flow in Task 3), then:

```bash
curl -s -X POST http://127.0.0.1:8788/api/agent/money/expenses -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"category":"food","amount":12.4}'
```

Expected: `201` with `"amountCents":1240,"category":"Food"` and `speech` starting `Logged €12.40 in Food.` If no local token is handy, rely on Task 3's script, which covers the same calls.

- [ ] **Step 6: Commit**

```bash
git add functions/lib/services/money/crud.ts functions/lib/services/money/agent.ts functions/lib/routes/agent.ts
git commit -m "Agent API: log and undo expenses by category name"
```

---

### Task 3: Isolation checks and README

**Files:**
- Modify: `scripts/isolation-check.mjs`
- Modify: `README.md` (Agent routes section, "How much money is left" block)

**Interfaces:**
- Consumes (Task 2): `POST /agent/money/expenses`, `DELETE /agent/money/expenses/:id`, error `details.categories`

- [ ] **Step 1: Add an owner-only category**

In `scripts/isolation-check.mjs`, right after the line `const bobCat = await bob("POST", "/money/categories", { name: \`Hobby ${run}\` });`:

```js
const ownerOnlyCat = await owner("POST", "/money/categories", { name: `OwnerOnly ${run}` });
```

- [ ] **Step 2: Add agent expense checks**

Insert right after `await owner("PATCH", \`/admin/users/${bobMe.id}\`, { features: ["money", "planner", "projects"] });` (the Money re-grant) and before the token revoke:

```js
// ---- agent expense logging (give Food a limit so the "left this month" sentence shows)
const bobFood = (await bob("GET", "/money/categories")).body.categories.find((c) => c.name === "Food");
await bob("PATCH", `/money/categories/${bobFood.id}`, { monthlyLimitCents: 1_000_000 });
const logged = await agent("POST", "/agent/money/expenses", { category: " FOOD ", amount: 12.4, note: "McDonald's \"big\" one" });
check("agent logs by category name, euros to cents", logged.status === 201 && logged.body.expense.amountCents === 1240 && logged.body.expense.category === "Food" && logged.body.expense.note === "McDonald's \"big\" one", JSON.stringify(logged.body));
check("agent speech shows amount and what's left", logged.body?.speech?.startsWith("Logged €12.40 in Food.") && logged.body.speech.includes("left in Food this month"), logged.body?.speech);
const lastMonth = await agent("POST", "/agent/money/expenses", { category: "Food", amount: 3, spentOn: "2026-09-15" });
check("agent can backdate; no 'this month' line for last month", lastMonth.status === 201 && lastMonth.body.expense.spentOn === "2026-09-15" && !lastMonth.body.speech.includes("this month"), JSON.stringify(lastMonth.body));
check("sub-cent amount rejected (400)", (await agent("POST", "/agent/money/expenses", { category: "Food", amount: 1.234 })).status === 400);
check("euros over 100000 rejected (400)", (await agent("POST", "/agent/money/expenses", { category: "Food", amount: 100000.01 })).status === 400);
const unknown = await agent("POST", "/agent/money/expenses", { category: `OwnerOnly ${run}`, amount: 5 });
check("owner's category name is unknown to Bob (404)", unknown.status === 404 && unknown.body.error.code === "unknown_category", JSON.stringify(unknown.body));
check("unknown_category lists only Bob's categories", Array.isArray(unknown.body.error.details?.categories) && unknown.body.error.details.categories.includes("Food") && !unknown.body.error.details.categories.includes(`OwnerOnly ${run}`), JSON.stringify(unknown.body.error.details));
// Other: archived Other comes back instead of clashing on name
const bobOther = (await bob("GET", "/money/categories")).body.categories.find((c) => c.name === "Other");
await bob("PATCH", `/money/categories/${bobOther.id}`, { archived: true });
const toOther = await agent("POST", "/agent/money/expenses", { category: "other", amount: 30, note: "gifts" });
check("archived Other is un-archived and used", toOther.status === 201 && toOther.body.expense.category === "Other", JSON.stringify(toOther.body));
const others = (await bob("GET", "/money/categories")).body.categories.filter((c) => c.name === "Other");
check("still exactly one Other, active", others.length === 1 && others[0].archived === false && others[0].id === bobOther.id);
check("Bob's agent can't undo owner's expense (404)", (await agent("DELETE", `/agent/money/expenses/${ownerExpense.body.expense.id}`)).status === 404);
const undo = await agent("DELETE", `/agent/money/expenses/${logged.body.expense.id}`);
check("agent undo removes the expense", undo.status === 200 && undo.body.speech === "Removed €12.40 from Food.", JSON.stringify(undo.body));
check("undo twice -> 404", (await agent("DELETE", `/agent/money/expenses/${logged.body.expense.id}`)).status === 404);
const ownerStillHas = (await owner("GET", "/money/expenses?month=2026-10")).body.expenses.some((e) => e.id === ownerExpense.body.expense.id);
check("owner's expense untouched", ownerStillHas);
```

- [ ] **Step 3: Run the isolation check**

Prerequisites: `.dev.vars` has `SUPABASE_JWT_SECRET=<any local test string>` uncommented (local only, git-ignored), local D1 is migrated (`npm run db:migrate:local`), and `npm run dev:api` is running.

Run: `node scripts/isolation-check.mjs`
Expected: every line `PASS`, ending `All isolation checks passed.`

- [ ] **Step 4: Update the README Agent routes**

In `README.md`, replace the heading line `**How much money is left this month** (read-only; expenses are logged in the app)` with `**How much money is left this month**`. Then, after the line `The speech names any category at 80% of its limit or over.`, add:

````markdown
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

To set it up in Hermes Agent, see [integrations/hermes/life-board-money](integrations/hermes/life-board-money/SKILL.md).
````

- [ ] **Step 5: Commit**

```bash
git add scripts/isolation-check.mjs README.md
git commit -m "Isolation checks and docs for agent expense logging"
```

---

### Task 4: Hermes skill and client script

**Files:**
- Create: `integrations/hermes/life-board-money/SKILL.md`
- Create: `integrations/hermes/life-board-money/scripts/life_board.py`
- Modify: `docs/DEPLOY.md` (one line pointing at the skill)

**Interfaces:**
- Consumes: `POST /api/agent/money/expenses`, `DELETE /api/agent/money/expenses/:id`, `GET /api/agent/money/left`
- Env: `LIFE_BOARD_URL` (e.g. `https://app.mohammedwishah.com`, no trailing `/api`), `LIFE_BOARD_TOKEN` (`lb_…`)

- [ ] **Step 1: Create `scripts/life_board.py`**

```python
#!/usr/bin/env python3
"""Tiny client for Life Board's agent API. Standard library only.

  life_board.py log --category Food --amount 12.40 [--note "Lidl"] [--date 2026-10-05]
  life_board.py undo EXPENSE_ID
  life_board.py left

Reads LIFE_BOARD_URL and LIFE_BOARD_TOKEN from the environment. Prints the JSON reply.
Exit code 0 on success, 1 on an API error (the JSON error is still printed), 2 on setup errors.
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request


def call(method, path, body=None):
    base = os.environ.get("LIFE_BOARD_URL", "").rstrip("/")
    token = os.environ.get("LIFE_BOARD_TOKEN", "")
    if not base or not token:
        print(json.dumps({"error": {"code": "not_configured", "message": "Set LIFE_BOARD_URL and LIFE_BOARD_TOKEN in ~/.hermes/.env"}}))
        sys.exit(2)
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(f"{base}/api/agent{path}", data=data, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            print(res.read().decode())
    except urllib.error.HTTPError as e:
        print(e.read().decode())
        sys.exit(1)
    except urllib.error.URLError as e:
        print(json.dumps({"error": {"code": "unreachable", "message": str(e.reason)}}))
        sys.exit(1)


def main():
    p = argparse.ArgumentParser(description="Life Board money client")
    sub = p.add_subparsers(dest="cmd", required=True)
    log = sub.add_parser("log")
    log.add_argument("--category", required=True)
    log.add_argument("--amount", required=True, type=float, help="euros, e.g. 12.40")
    log.add_argument("--note")
    log.add_argument("--date", help="YYYY-MM-DD, default today")
    undo = sub.add_parser("undo")
    undo.add_argument("id")
    sub.add_parser("left")
    a = p.parse_args()

    if a.cmd == "log":
        body = {"category": a.category, "amount": a.amount}
        if a.note:
            body["note"] = a.note
        if a.date:
            body["spentOn"] = a.date
        call("POST", "/money/expenses", body)
    elif a.cmd == "undo":
        call("DELETE", f"/money/expenses/{urllib.parse.quote(a.id, safe='')}")
    else:
        call("GET", "/money/left")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Create `SKILL.md`**

````markdown
---
name: life-board-money
description: Log spending to Life Board by voice or text
version: 1.0.0
metadata:
  hermes:
    tags: [Finance, Budget, Personal]
required_environment_variables:
  - name: LIFE_BOARD_URL
    prompt: "Life Board address, e.g. https://app.mohammedwishah.com"
    help: "The dashboard's address, without /api"
    required_for: "Logging expenses"
  - name: LIFE_BOARD_TOKEN
    prompt: "Life Board voice assistant token (starts with lb_)"
    help: "In Life Board: click your email > Voice assistant > Create"
    required_for: "Logging expenses"
---

# Life Board money

## When to Use

- The user says they spent or paid money: "50 euro food", "spent 12.40 at Lidl", "yesterday 20 on a taxi", or a voice note with the same.
- The user says "undo that", "delete the last one" or "that was wrong" right after a logged expense.
- The user asks how much money is left this month.

## Procedure

Run the client with the terminal tool. Always quote arguments.

**Log.** Pull out the amount in euros, a category and an optional short note (shop or item).

```
python3 ${HERMES_SKILL_DIR}/scripts/life_board.py log --category "Food" --amount 50 --note "Lidl"
```

- For a past day, add `--date YYYY-MM-DD` (Europe/Berlin calendar; "yesterday" is today minus one day).
- If the reply is an error with code `unknown_category`, read `error.details.categories`:
  - If one is clearly the same kind of spending (groceries → Food, uber → Transport, cinema → Fun), retry once with that exact name.
  - Otherwise retry once with `--category "Other"` and put the item in `--note` (e.g. "gifts").
- On success, reply with the `speech` text. Remember `expense.id` for undo.

**Undo.** Use the `expense.id` from the expense you just logged:

```
python3 ${HERMES_SKILL_DIR}/scripts/life_board.py undo EXPENSE_ID
```

Reply with `speech`.

**Money left.**

```
python3 ${HERMES_SKILL_DIR}/scripts/life_board.py left
```

Reply with `speech`.

## Pitfalls

- `--amount` is euros, never cents. "fifty" is `50`; "twelve forty" is `12.40`. At most 2 decimals.
- Never invent a category. Use one from `error.details.categories`, or `Other`.
- If the amount or what it was for is unclear, ask one short question instead of guessing.
- Error code `not_configured` means the user must put `LIFE_BOARD_URL` and `LIFE_BOARD_TOKEN` in `~/.hermes/.env`. `401` means the token was revoked or mistyped. `403 feature_disabled` means Money is off for this account.
- Never print or repeat the token.

## Verification

A successful log prints JSON with `"expense"` and a `speech` starting with "Logged €". The expense shows up in Life Board under Money → Recent expenses.
````

- [ ] **Step 3: Check the script locally**

Run: `python -I integrations/hermes/life-board-money/scripts/life_board.py --help` and `python -I integrations/hermes/life-board-money/scripts/life_board.py left`. The second runs without env vars set.
Expected: usage text, then a `not_configured` JSON line with exit code 2.

If the local API from Task 3 is running with a token:
`LIFE_BOARD_URL=http://127.0.0.1:8788 LIFE_BOARD_TOKEN=lb_… python -I …/life_board.py log --category food --amount 4.5 --note "McDonald's"`
Expected: 201 JSON whose `expense.note` is exactly `McDonald's`.

- [ ] **Step 4: Point to it from `docs/DEPLOY.md`**

Append at the end of `docs/DEPLOY.md`:

```markdown
## Hermes Agent (Telegram)

Log spending by message or voice note: see `integrations/hermes/life-board-money/SKILL.md`. Copy that folder to `~/.hermes/skills/` and put `LIFE_BOARD_URL` and `LIFE_BOARD_TOKEN` in `~/.hermes/.env`.
```

- [ ] **Step 5: Commit**

```bash
git add integrations/hermes docs/DEPLOY.md
git commit -m "Hermes skill for logging expenses"
```
