#!/usr/bin/env python3
"""Hermes cron script: prints Life Board's evening brief, or nothing (Hermes then stays silent).

Hermes cron scripts don't inherit ~/.hermes/.env, so this reads it directly.
Install: copy into ~/.hermes/scripts/ and run
  hermes cron create "0 21 * * *" --no-agent --script life_board_evening.py --deliver telegram --name life-board-evening
"""
import json
import os
import pathlib
import urllib.error
import urllib.request

KIND = "evening"


def setting(name):
    if os.environ.get(name):
        return os.environ[name]
    env = pathlib.Path(os.environ.get("HERMES_HOME", pathlib.Path.home() / ".hermes")) / ".env"
    try:
        for line in env.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("export "):
                line = line[len("export "):]
            key, sep, value = line.partition("=")
            if not sep or key.strip() != name:
                continue
            value = value.strip()
            if value[:1] in ("'", '"'):
                return value[1:].split(value[0], 1)[0]
            return value.split(" #", 1)[0].strip()
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
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            print(f"Life Board: token rejected ({e.code}). Create a new one in Voice assistant and update ~/.hermes/.env")
        else:
            print(f"Life Board error {e.code}")
        return
    except Exception as e:  # noqa: BLE001
        print(f"Life Board unreachable: {e}")
        return
    if message:
        print(message)


if __name__ == "__main__":
    main()
