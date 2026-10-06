#!/usr/bin/env python3
"""Tiny client for Life Board's agent API. Standard library only.

  life_board.py log --category Food --amount 12.40 [--note "Lidl"] [--date 2026-10-05]
  life_board.py undo EXPENSE_ID
  life_board.py left
  life_board.py plan
  life_board.py check --habit Gym [--date 2026-10-05]     (uncheck to undo)
  life_board.py top3 "Call the bank" "Finish report" [--date ...]
  life_board.py done --task "Call the bank"              (or --task 2)

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


def euros(text):
    """'12,40' or '12.40' -> 12.4. argparse turns a ValueError into a clean usage error."""
    return float(text.strip().replace(",", "."))


def emit(raw):
    # Pass the server's UTF-8 through as bytes, so "€" survives any console encoding.
    sys.stdout.buffer.write(raw.rstrip(b"\n") + b"\n")
    sys.stdout.flush()


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
            emit(res.read())
    except urllib.error.HTTPError as e:
        emit(e.read())
        sys.exit(1)
    except urllib.error.URLError as e:
        print(json.dumps({"error": {"code": "unreachable", "message": str(e.reason)}}))
        sys.exit(1)
    except OSError as e:
        # Timeouts and dropped connections while reading the reply: the request may have been saved.
        print(json.dumps({"error": {"code": "no_reply", "message": f"No reply from Life Board ({e}). The request may have gone through."}}))
        sys.exit(1)


def main():
    p = argparse.ArgumentParser(description="Life Board client (money and planner)")
    sub = p.add_subparsers(dest="cmd", required=True)
    log = sub.add_parser("log")
    log.add_argument("--category", required=True)
    log.add_argument("--amount", required=True, type=euros, help="euros, e.g. 12.40 or 12,40")
    log.add_argument("--note")
    log.add_argument("--date", help="YYYY-MM-DD, default today")
    undo = sub.add_parser("undo")
    undo.add_argument("id")
    sub.add_parser("left")
    sub.add_parser("plan")
    for name in ("check", "uncheck"):
        c = sub.add_parser(name)
        c.add_argument("--habit", required=True)
        c.add_argument("--date", help="YYYY-MM-DD, default today")
    top3 = sub.add_parser("top3")
    top3.add_argument("tasks", nargs="+", help="1 to 3 tasks, each quoted")
    top3.add_argument("--date")
    done = sub.add_parser("done")
    done.add_argument("--task", required=True, help="task text, or 1-3 for its position")
    done.add_argument("--date")
    a = p.parse_args()

    def dated(body):
        if getattr(a, "date", None):
            body["date"] = a.date
        return body

    if a.cmd == "log":
        body = {"category": a.category, "amount": a.amount}
        if a.note:
            body["note"] = a.note
        if a.date:
            body["spentOn"] = a.date
        call("POST", "/money/expenses", body)
    elif a.cmd == "undo":
        call("DELETE", f"/money/expenses/{urllib.parse.quote(a.id, safe='')}")
    elif a.cmd == "left":
        call("GET", "/money/left")
    elif a.cmd == "plan":
        call("GET", "/planner/today")
    elif a.cmd in ("check", "uncheck"):
        call("POST" if a.cmd == "check" else "DELETE", "/planner/habits/check", dated({"habit": a.habit}))
    elif a.cmd == "top3":
        call("PUT", "/planner/tasks", dated({"tasks": a.tasks}))
    else:
        call("POST", "/planner/tasks/done", dated({"task": a.task}))

if __name__ == "__main__":
    main()
