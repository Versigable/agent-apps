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
    if len(sys.argv) == 4 and sys.argv[2] == "--general-task":
        # Exact and archive-aware: unrelated retained history must not consume
        # this task's subprocess budget. Parameters never become SQL syntax.
        task_id = sys.argv[3]
        if conn.execute("SELECT id FROM tasks WHERE id=?", (task_id,)).fetchone() is None:
            print("null")
            sys.exit(0)
        comments = [dict(row) for row in conn.execute(
            "SELECT * FROM task_comments WHERE task_id=? ORDER BY created_at ASC", (task_id,))]
        events = [dict(row) for row in conn.execute(
            "SELECT * FROM task_events WHERE task_id=? ORDER BY created_at ASC,id ASC", (task_id,))]
        for item in events:
            if item.get("payload"):
                try:
                    item["payload"] = json.loads(item["payload"])
                except (ValueError, TypeError):
                    pass
        parents = [row[0] for row in conn.execute(
            "SELECT parent_id FROM task_links WHERE child_id=? ORDER BY parent_id", (task_id,))]
        children = [row[0] for row in conn.execute(
            "SELECT child_id FROM task_links WHERE parent_id=? ORDER BY child_id", (task_id,))]
        print(json.dumps({"comments": comments, "events": events,
                          "dependencies": {"parents": parents, "children": children}}))
        sys.exit(0)
    if sys.argv[2:] in (["--snapshot"], ["--write-snapshot"]):
        # One read transaction keeps membership and history consistent. Include
        # archived cards for exact-target readback; the board omits them later.
        available = {row[1] for row in conn.execute("PRAGMA table_info(tasks)")}
        fields = [name for name in ("id", "title", "body", "status", "assignee", "tenant",
                  "priority", "created_at", "updated_at", "result") +
                  (("idempotency_key", "workspace_kind", "workspace_path", "skills", "max_runtime_seconds")
                   if sys.argv[2:] == ["--write-snapshot"] else ()) if name in available]
        tasks = [dict(row) for row in conn.execute("SELECT " + ",".join(fields) + " FROM tasks")]
        details = {task["id"]: {"comments": [], "events": [],
                   "dependencies": {"parents": [], "children": []}} for task in tasks}
        for row in conn.execute("SELECT id,task_id,author,body,created_at FROM task_comments ORDER BY id"):
            if row["task_id"] in details:
                details[row["task_id"]]["comments"].append(dict(row))
        event_query = "SELECT id,task_id,kind,created_at,CASE WHEN kind IN ('linked','unlinked') THEN payload ELSE NULL END AS payload FROM task_events ORDER BY id"
        for row in conn.execute(event_query):
            if row["task_id"] in details:
                item = dict(row)
                details[row["task_id"]]["events"].append(item)
        for row in conn.execute("SELECT parent_id,child_id FROM task_links"):
            if row["child_id"] in details:
                details[row["child_id"]]["dependencies"]["parents"].append(row["parent_id"])
            if row["parent_id"] in details:
                details[row["parent_id"]]["dependencies"]["children"].append(row["child_id"])
        if sys.argv[2:] == ["--write-snapshot"]:
            for row in conn.execute("SELECT task_id,payload FROM task_events WHERE kind='created' ORDER BY id"):
                if row["task_id"] in details and "creation" not in details[row["task_id"]]:
                    try:
                        creation = json.loads(row["payload"])
                        if isinstance(creation, dict):
                            details[row["task_id"]]["creation"] = creation
                    except (ValueError, TypeError):
                        pass
        tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if "task_runs" in tables:
            for row in conn.execute("SELECT task_id,summary,metadata FROM task_runs WHERE outcome='completed' ORDER BY COALESCE(ended_at,started_at,0) DESC,id DESC"):
                if row["task_id"] in details and "completion" not in details[row["task_id"]]:
                    try:
                        metadata = json.loads(row["metadata"]) if row["metadata"] else None
                    except (ValueError, TypeError):
                        metadata = None
                    details[row["task_id"]]["completion"] = {"summary": row["summary"], "metadata": metadata}
        print(json.dumps({"tasks": tasks, "details": details}))
        sys.exit(0)
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
