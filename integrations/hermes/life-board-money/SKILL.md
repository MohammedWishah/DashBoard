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
- After a `no_reply` error, never log again on your own: the expense may already be saved. Tell the user and let them check Life Board or tell you to retry. After `unreachable`, nothing was sent, so one retry is fine.
- If the reply names a date ("… on 2026-10-05"), make sure it's the day the user meant. If it isn't, undo and log again with the right `--date`.
- Never print or repeat the token.

## Verification

A successful log prints JSON with `"expense"` and a `speech` starting with "Logged €". The expense shows up in Life Board under Money → Recent expenses.
