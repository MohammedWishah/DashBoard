---
name: life-board
description: Log spending and run the daily planner in Life Board
version: 1.0.0
metadata:
  hermes:
    tags: [Finance, Budget, Productivity, Personal]
required_environment_variables:
  - name: LIFE_BOARD_URL
    prompt: "Life Board address, e.g. https://app.mohammedwishah.com"
    help: "The dashboard's address, without /api"
    required_for: "Money and planner"
  - name: LIFE_BOARD_TOKEN
    prompt: "Life Board voice assistant token (starts with lb_)"
    help: "In Life Board: click your email > Voice assistant > Create"
    required_for: "Money and planner"
---

# Life Board

## When to Use

- The user says they spent or paid money: "50 euro food", "spent 12.40 at Lidl", "yesterday 20 on a taxi", or a voice note with the same.
- The user says "undo that", "delete the last one" or "that was wrong" right after a logged expense.
- The user asks how much money is left this month.
- The user reports doing a habit ("did gym", "read today", "cleaned this week") or undoing one.
- The user sets or updates today's top 3, marks one done, or asks for today's plan.
- The user reports their energy ("energy low", "tired today" means low, "great day" means high).
- The user wants to buy something ("I want AirPods, 200") — put it on the want list instead of logging it — or decides on a waiting item ("skip the AirPods", "bought the AirPods").

## Procedure

Run the client with the terminal tool. Always quote arguments.

### Money

**Log.** Pull out the amount in euros, a category and an optional short note (shop or item).

```
python3 ${HERMES_SKILL_DIR}/scripts/life_board.py log --category 'Food' --amount 50 --note 'Lidl'
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

### Planner

**Tick a habit.** Use the habit's name. The server picks today, this week or this month from the habit itself.

```
python3 ${HERMES_SKILL_DIR}/scripts/life_board.py check --habit "Gym"
```

- For an earlier day, add `--date YYYY-MM-DD`. Use `uncheck` instead of `check` to undo.
- On `unknown_habit`, read `error.details.habits`. If one clearly matches ("workout" → "Gym"), retry once with that exact name; otherwise ask the user which habit. Never create habits; the user adds them in Life Board.

**Set the top 3.** It replaces today's list. Pass 1 to 3 tasks, each quoted:

```
python3 ${HERMES_SKILL_DIR}/scripts/life_board.py top3 "Call the bank" "Finish report" "Groceries"
```

**Mark a top-3 task done** by its text or position:

```
python3 ${HERMES_SKILL_DIR}/scripts/life_board.py done --task "Call the bank"
```

**Today's plan.**

```
python3 ${HERMES_SKILL_DIR}/scripts/life_board.py plan
```

Reply with `speech` every time.

**Energy.** One level a day (low, ok or high). Logging again replaces it:

```
python3 ${HERMES_SKILL_DIR}/scripts/life_board.py energy high
```

A `403 extra_disabled` means the Energy check-in extra is off (Life Board, People, Extras).

### Want list

When the user *wants* something (hasn't bought it), add it. It waits 1, 3 or 7 days by price:

```
python3 ${HERMES_SKILL_DIR}/scripts/life_board.py want --name "AirPods" --amount 200
```

When they decide:

```
python3 ${HERMES_SKILL_DIR}/scripts/life_board.py want-skip --name "AirPods"
python3 ${HERMES_SKILL_DIR}/scripts/life_board.py want-buy --name "AirPods" --category "Fun"
```

On `unknown_want`, read `error.details.wants` and pick the matching name, or ask. A `403 extra_disabled` means the Want list is switched off. Then tell the user it can be turned on in Life Board → People → Extras.

### Nudges

Morning, evening and weekly messages come from three script jobs, not from you. If the user asks to change their times, use `hermes cron edit` on `life-board-morning`, `life-board-evening` or `life-board-weekly`. To see a brief now: `life_board.py brief morning`.

## Pitfalls

- `--amount` is euros, never cents. "fifty" is `50`; "twelve forty" is `12.40`. At most 2 decimals.
- Never invent a category. Use one from `error.details.categories`, or `Other`.
- If the amount or what it was for is unclear, ask one short question instead of guessing.
- Error code `not_configured` means the user must put `LIFE_BOARD_URL` and `LIFE_BOARD_TOKEN` in `~/.hermes/.env`. `401` means the token was revoked or mistyped. `403 feature_disabled` means Money is off for this account.
- After a `no_reply` error, never log again on your own: the expense may already be saved. Tell the user and let them check Life Board or tell you to retry. After `unreachable`, nothing was sent, so one retry is fine.
- If the reply names a date ("… on 2026-10-05"), make sure it's the day the user meant. If it isn't, undo and log again with the right `--date`.
- `top3` replaces the whole list. To add one task to an existing list, run `plan` first and send all tasks together (at most 3).
- If the user already bought something, log it as an expense (`log`), not a want.
- Wrap free text (names, notes, tasks) in **single quotes**, and write an apostrophe as `'\''`. Double quotes let the shell read `$5` and backticks.
- Never print or repeat the token.

## Verification

A successful log prints JSON with `"expense"` and a `speech` starting with "Logged €". The expense shows up in Life Board under Money → Recent expenses.
