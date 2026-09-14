#!/usr/bin/env python3
"""Read task snapshots without Hermes CLI init/recompute_ready side effects.

Deliberately stdlib-only; never opens a writable connection or migrates schemas.
The bridge passes an explicit board and honors the CLI's shared Kanban root.
"""
import json
import os
from pathlib import Path
import re
import sqlite3
import sys

board = sys.argv[1]
if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}", board):
    raise ValueError("invalid board slug")
native_root = Path.home() / ".hermes"
root = native_root
env_home = os.environ.get("HERMES_HOME", "")
if env_home:
    env_path = Path(env_home).expanduser()
    if not env_path.resolve().is_relative_to(native_root.resolve()):
        root = env_path.parent.parent if env_path.parent.name == "profiles" else env_path
if os.environ.get("HERMES_KANBAN_HOME", "").strip():
    root = Path(os.environ["HERMES_KANBAN_HOME"].strip()).expanduser()
db = Path(os.environ["HERMES_KANBAN_DB"]).expanduser() if os.environ.get("HERMES_KANBAN_DB") else (root / "kanban.db" if board == "default" else root / "kanban" / "boards" / board / "kanban.db")
with sqlite3.connect(db.resolve().as_uri() + "?mode=ro", uri=True) as conn:
    conn.execute("PRAGMA query_only=ON")
    conn.row_factory = sqlite3.Row
    conn.execute("BEGIN")
    tasks = [dict(row) for row in conn.execute("SELECT * FROM tasks WHERE status != 'archived'")]
    tasks.sort(key=lambda task: (-int(task.get("priority") or 0), task.get("created_at") or 0))
    tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    comments = dict(conn.execute("SELECT task_id, COUNT(*) FROM task_comments GROUP BY task_id")) if "task_comments" in tables else {}
    parents = dict(conn.execute("SELECT child_id, COUNT(*) FROM task_links GROUP BY child_id")) if "task_links" in tables else {}
    children = dict(conn.execute("SELECT parent_id, COUNT(*) FROM task_links GROUP BY parent_id")) if "task_links" in tables else {}
    summaries = {}
    if "task_runs" in tables:
        for row in conn.execute("SELECT task_id, summary FROM task_runs WHERE summary IS NOT NULL AND summary != '' ORDER BY COALESCE(ended_at, started_at) DESC, id DESC"):
            summaries.setdefault(row["task_id"], row["summary"])
    for task in tasks:
        task["comment_count"] = comments.get(task["id"], 0)
        task["link_counts"] = {"parents": parents.get(task["id"], 0), "children": children.get(task["id"], 0)}
        task["latest_summary"] = summaries.get(task["id"])
print(json.dumps(tasks))
