#!/usr/bin/env python3
"""Hermes cron script: prints Life Board's evening brief, or nothing (Hermes then stays silent).

Hermes cron scripts don't inherit ~/.hermes/.env, so this reads it directly.
Install: copy into ~/.hermes/scripts/ and run
  hermes cron create "0 21 * * *" --no-agent --script life_board_evening.py --deliver telegram --name life-board-evening
"""
import json
import os
import pathlib
import urllib.request

KIND = "evening"


def setting(name):
    if os.environ.get(name):
        return os.environ[name]
    env = pathlib.Path(os.environ.get("HERMES_HOME", pathlib.Path.home() / ".hermes")) / ".env"
    try:
        for line in env.read_text(encoding="utf-8").splitlines():
            key, _, value = line.partition("=")
            if key.strip() == name:
                return value.strip().strip('"').strip("'")
    except OSError:
        pass
    return ""


def main():
    base, token = setting("LIFE_BOARD_URL").rstrip("/"), setting("LIFE_BOARD_TOKEN")
    if not base or not token:
        print("Life Board: set LIFE_BOARD_URL and LIFE_BOARD_TOKEN in ~/.hermes/.env")
        return
    req = urllib.request.Request(f"{base}/api/agent/briefing/{KIND}", headers={"Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            message = json.loads(res.read().decode("utf-8")).get("message", "")
    except Exception as e:  # noqa: BLE001 - one line to Telegram beats a silent failure
        print(f"Life Board unreachable: {e}")
        return
    if message:
        print(message)


if __name__ == "__main__":
    main()
