# Log expenses from Hermes Agent

Date: 2026-10-06. Status: approved in chat, awaiting spec review.

## Goal

Log a purchase in a few seconds without opening the dashboard. The user sends a Telegram voice note or text to their Hermes Agent ("50 euro food") and an expense appears in Money.

Out of scope: Alexa (dropped), logging income, editing expenses by voice (only undo).

## Who does what

- **Hermes** (an LLM agent) understands the sentence and turns it into a structured request: category, amount in euros, optional note and date. It also picks the closest category.
- **The dashboard** validates and saves. It does no language parsing.

## API

Both routes live in `functions/lib/routes/agent.ts`. They use the existing agent token auth and are already covered by `requireFeature("money")` through the `/agent/money/*` rule in `app.ts`.

### `POST /api/agent/money/expenses`

Body (Zod, in `shared/schemas.ts`):

| Field | Type | Rule |
|---|---|---|
| `category` | string | 1 to 60 chars, trimmed |
| `amount` | number | euros, > 0 and <= 100000, at most 2 decimals |
| `note` | string? | trimmed, max 1000 (same as the browser route) |
| `spentOn` | `YYYY-MM-DD`? | defaults to `berlinToday()` |

`amount` is euros, unlike the browser routes (cents). An agent saying "50" means 50 euros, and cents would silently store €0.50. The server converts with `Math.round(amount * 100)`.

Category resolution (new service function `resolveCategoryForAgent`):

1. Compare `category` to the user's **non-archived** categories, trimmed and case-insensitive. First match by sort order wins.
2. If `category` is "other" (any case) and no non-archived Other exists, create a category named `Other` with no limit and use it.
3. Otherwise respond `404 unknown_category`. The error carries `details: { categories: string[] }` (non-archived names, via the existing `ApiError` details field) so the agent can retry without another call. The message says to retry with the closest name, or with `Other` and the item as the note.

Success, `201`:

```json
{
  "expense": { "id": "...", "category": "Food", "amountCents": 5000, "spentOn": "2026-10-06", "note": null },
  "speech": "Logged €50.00 in Food. 38 euros left in Food this month."
}
```

The speech uses `formatEuro` for the logged amount, so cents stay visible and a mistake is easy to spot. The second sentence appears only when the category has a monthly limit and the expense is in the current month. It says "left" or "over" like `getMoneyLeft`.

The expense is created through the existing `createExpense`, so it's identical to one logged in the app.

### `DELETE /api/agent/money/expenses/:id`

This is for "undo that". It calls the existing `deleteExpense` (scoped by user id, 404 if not theirs) and returns `{ "speech": "Removed €50.00 from Food." }`.

## Hermes skill

The file is `integrations/hermes/life-board-money/SKILL.md`. The user copies the folder into `~/.hermes/skills/`.

- Frontmatter: `name`, short `description`, `version`, `required_environment_variables: [LIFE_BOARD_URL, LIFE_BOARD_TOKEN]`.
- Procedure: parse the message, then `curl` POST.
  - On `unknown_category`: pick the closest name from the returned list. If none fits, use `Other` and put the item in `note`. Then retry once.
  - Reply with `speech`.
  - Keep the returned `expense.id` for undo.
- Also covers "how much is left" with the existing `GET /api/agent/money/left`, and undo with the DELETE route.
- Pitfalls:
  - Amounts are euros, not cents.
  - Never invent a category name other than an existing one or `Other`.
  - "Yesterday" means `spentOn` is today minus one day, Berlin time.

## Errors

These are the existing error shapes (`{ error: { code, message } }`):

- 400 for validation errors
- 401 for a bad token
- 403 `feature_disabled` when Money is off
- 404 `unknown_category`, with `error.details.categories`

## Testing

- **Unit (vitest):**
  - Euro to cents conversion: `12.4` gives 1240, `0.1 + 0.2` style values round correctly, 3 decimals are rejected.
  - Category resolution: case-insensitive, archived ignored, Other auto-created only once, unknown returns the list.
- **`scripts/isolation-check.mjs`:**
  - User B's token can't delete user A's expense (404).
  - B's POST never resolves to A's categories.
- **README:** curl examples under "Agent routes", and the README line "expenses are logged in the app" is removed.
