#!/usr/bin/env python3
"""Scoped installed-Hermes writer. Never initializes/migrates the task store."""
import json
from functools import lru_cache
import os
from pathlib import Path
import re
import sqlite3
import subprocess


@lru_cache(maxsize=128)
def game_of(body):
    if not isinstance(body, str) or body.count('```game-dev') != 1:
        return None
    # Reuse the exact canonical parser, including raster/capture validation.
    # A weaker Python JSON game_id extractor would authorize malformed tasks
    # which the HTTP adapter correctly regards as unclassified. Use stdin (not
    # shell/argv) for large bodies; failures deny rather than downgrade parsing.
    module = Path(__file__).with_name('kanban-games.mjs').resolve().as_uri()
    program = "import fs from 'node:fs'; const {parseGameDev}=await import(process.argv[1]); console.log(JSON.stringify(parseGameDev(fs.readFileSync(0,'utf8'))?.game_id ?? null));"
    result = subprocess.run([os.environ.get('KANBAN_NODE','node'),'--input-type=module','-e',program,module],
                            input=body,text=True,capture_output=True,timeout=3,check=True)
    return json.loads(result.stdout)


class ScopedConnection(sqlite3.Connection):
    scope_targets: tuple
    scope_game: str
    scope_archived: set

    def execute(self, sql, parameters=(), /):
        boundary = sql.strip().upper()
        archived = set()
        if boundary == 'COMMIT' and self.in_transaction:
            # Capture under the lock, never by a racy post-COMMIT read. Only an
            # archive committed by THIS operation may continue its lifecycle.
            for task_id in self.scope_targets:
                row = super().execute('SELECT status FROM tasks WHERE id=?',(task_id,)).fetchone()
                if row is not None and row[0] == 'archived':
                    archived.add(task_id)
        cursor = super().execute(sql, parameters)
        if boundary == 'COMMIT':
            self.scope_archived.update(archived)
        if boundary == 'BEGIN IMMEDIATE':
            try:
                for task_id in self.scope_targets:
                    row = super().execute('SELECT body,status FROM tasks WHERE id=?', (task_id,)).fetchone()
                    if row is None or game_of(row['body']) != self.scope_game or (row['status'] == 'archived' and task_id not in self.scope_archived):
                        raise PermissionError('Scoped target unavailable')
            except BaseException:
                super().execute('ROLLBACK')
                raise
        return cursor


def open_scoped_connection(database, game, targets):
    database = Path(database).resolve(strict=True)
    conn = sqlite3.connect(database.as_uri() + '?mode=rw', uri=True, isolation_level=None,
                           timeout=5, factory=ScopedConnection)
    conn.row_factory = sqlite3.Row
    conn.scope_game = game
    conn.scope_targets = tuple(targets)
    conn.scope_archived = set()
    conn.execute('PRAGMA foreign_keys=ON')
    conn.create_function('operator_same_game', 1, lambda body: int(game_of(body) == game))
    # TEMP triggers belong only to this connection, not the authoritative schema.
    # They run in the mutator's write transaction, including indirect lifecycle
    # writes to task rows, history, links and task-owned auxiliary tables.
    tables = [row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
    for table in tables:
        if not re.fullmatch(r'[a-zA-Z_][a-zA-Z0-9_]*', table):
            raise ValueError('Unsupported schema identifier')
        columns = {row[1] for row in conn.execute(f'PRAGMA table_info("{table}")')}
        for action, refs in [('INSERT', ['NEW']), ('UPDATE', ['OLD', 'NEW']), ('DELETE', ['OLD'])]:
            conditions = []
            for ref in refs:
                if table == 'tasks':
                    conditions.append(f'operator_same_game({ref}.body) = 1')
                else:
                    ids = ['parent_id', 'child_id'] if table == 'task_links' else ['task_id'] if 'task_id' in columns else []
                    for column in ids:
                        conditions.append(f'EXISTS(SELECT 1 FROM main.tasks WHERE id={ref}.{column} AND operator_same_game(body)=1)')
            if conditions:
                predicate = ' AND '.join(conditions)
                conn.execute(f'CREATE TEMP TRIGGER "operator_{table}_{action}" BEFORE {action} ON main."{table}" WHEN NOT ({predicate}) BEGIN SELECT RAISE(ABORT, \'Scoped mutation denied\'); END')
    return conn



def main(argv=None):
    import argparse
    import contextlib
    import os
    import sys

    envelope = argparse.ArgumentParser(allow_abbrev=False)
    envelope.add_argument('--protocol', required=True, choices=['game-dev-write-v1'])
    envelope.add_argument('--database', required=True)
    envelope.add_argument('--game', required=True)
    envelope.add_argument('command', nargs=argparse.REMAINDER)
    request = envelope.parse_args(argv)
    source = os.environ.get('KANBAN_HERMES_SOURCE', '')
    if not Path(source).is_absolute():
        raise ValueError('KANBAN_HERMES_SOURCE must name installed Hermes source')
    sys.path.insert(0, source)
    from hermes_cli import kanban_db as kb
    # Preserve the installed durable guard BEFORE opening any DB. The installed
    # write_txn calls the same guard again; no environment or guard is removed.
    kb._assert_not_delegated_child_mutation()
    from hermes_cli import kanban as cli, kanban_db_connect as kbc, kanban_parser
    command = request.command
    if command[:4] != ['--', 'kanban', '--board', 'default']:
        raise ValueError('Only the default board is supported')
    parser = argparse.ArgumentParser(allow_abbrev=False)
    kanban_parser.build_parser(parser.add_subparsers())
    args = parser.parse_args(command[1:])
    allowed = {'create','comment','assign','block','unblock','complete','archive','reclaim','reassign','edit','link','unlink'}
    if args.kanban_action not in allowed:
        raise ValueError('Unsupported scoped operation')
    if not re.fullmatch(r'[a-zA-Z0-9_-]{1,64}', request.game):
        raise ValueError('Invalid game')
    database = Path(request.database).resolve(strict=True)
    if database != kb.kanban_db_path(board='default').resolve(strict=True):
        raise ValueError('Scoped store identity mismatch')
    targets = list(getattr(args, 'task_ids', None) or [])
    for key in ('task_id', 'parent_id', 'child_id'):
        value = getattr(args,key,None)
        if value:
            targets.append(value)
    targets.extend(getattr(args,'parent',None) or [])
    if args.kanban_action == 'create' and (not args.triage or game_of(args.body) != request.game):
        raise ValueError('Scoped creation requires classified triage')
    conn = open_scoped_connection(database,request.game,targets)
    original = kbc.connect_closing
    @contextlib.contextmanager
    def scoped_connection(*unused, **unused_kw):
        # Dedicated process, one exact DB handle. Never call installed init_db or
        # create extra unguarded handles via the CLI's normal connection factory.
        yield conn
    kbc.connect_closing = scoped_connection
    try:
        with kb.scoped_current_board('default'):
            if args.kanban_action == 'create':
                # create_task explicitly supports nested write_txn/savepoints.
                # Serialize external idempotency races before its early lookup.
                with kbc.write_txn(conn):
                    key = getattr(args,'idempotency_key',None)
                    if key and conn.execute('SELECT 1 FROM tasks WHERE idempotency_key=?',(key,)).fetchone():
                        raise ValueError('Concurrent idempotency target; refresh and retry')
                    return int(cli._HANDLERS[args.kanban_action](args) or 0)
            return int(cli._HANDLERS[args.kanban_action](args) or 0)
    finally:
        kbc.connect_closing = original
        conn.close()


if __name__ == '__main__':
    import sys
    try:
        sys.exit(main())
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
