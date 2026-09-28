"""Connection-level authorization tests use disposable SQLite, not installed mutations."""
import importlib.util
import json
from pathlib import Path
import sqlite3
import subprocess
import sys

WRITER = Path(__file__).resolve().parents[1] / 'scripts/game-dev-scoped-writer.py'


def load_writer():
    spec = importlib.util.spec_from_file_location('scoped_writer', WRITER)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def body(game):
    return '```game-dev\n' + json.dumps(dict(game_id=game, milestone='Test', discipline='qa')) + '\n```'


def test_external_reclassification_is_checked_inside_comment_transaction(tmp_path):
    db = tmp_path / 'tasks.db'
    with sqlite3.connect(db) as conn:
        conn.executescript('CREATE TABLE tasks(id TEXT PRIMARY KEY,body TEXT,status TEXT,idempotency_key TEXT); CREATE TABLE task_comments(id INTEGER PRIMARY KEY,task_id TEXT,body TEXT); CREATE TABLE task_links(parent_id TEXT,child_id TEXT);')
        conn.execute('INSERT INTO tasks VALUES(?,?,?,NULL)', ('same',body('fps-gauntlet'),'triage'))
    writer = load_writer()
    conn = writer.open_scoped_connection(db, 'fps-gauntlet', ['same'])
    # Real independent process commits AFTER the connection/earlier read opened.
    assert conn.execute('SELECT body FROM tasks').fetchone()['body'] == body('fps-gauntlet')
    subprocess.run([sys.executable,'-c', 'import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); c.execute("UPDATE tasks SET body=?",(sys.argv[2],)); c.commit()',str(db),body('snowdown')],check=True)
    try:
        conn.execute('BEGIN IMMEDIATE')
    except (PermissionError, sqlite3.DatabaseError):
        pass
    else:
        raise AssertionError('reclassified task authorized')
    conn.close()
    with sqlite3.connect(db) as conn:
        assert conn.execute('SELECT count(*) FROM task_comments').fetchone()[0] == 0
        assert conn.execute('SELECT count(*) FROM sqlite_master WHERE type="trigger"').fetchone()[0] == 0



def test_connection_triggers_reject_foreign_indirect_writes_and_new_classification(tmp_path):
    db = tmp_path / 'tasks.db'
    with sqlite3.connect(db) as conn:
        conn.executescript('CREATE TABLE tasks(id TEXT PRIMARY KEY,body TEXT,status TEXT,idempotency_key TEXT); CREATE TABLE task_comments(id INTEGER PRIMARY KEY,task_id TEXT,body TEXT); CREATE TABLE task_links(parent_id TEXT,child_id TEXT);')
        conn.executemany('INSERT INTO tasks VALUES(?,?,?,NULL)', [('same',body('fps-gauntlet'),'triage'),('foreign',body('snowdown'),'triage')])
    conn = load_writer().open_scoped_connection(db,'fps-gauntlet',['same'])
    for sql, params in [
        ('INSERT INTO task_comments(task_id,body) VALUES(?,?)', ('foreign','No')),
        ('UPDATE tasks SET body=? WHERE id=?', (body('snowdown'),'same')),
        ('INSERT INTO task_links VALUES(?,?)', ('same','foreign')),
        ('DELETE FROM tasks WHERE id=?', ('foreign',)),
    ]:
        conn.execute('BEGIN IMMEDIATE')
        try:
            conn.execute(sql,params)
        except sqlite3.DatabaseError:
            conn.execute('ROLLBACK')
        else:
            conn.execute('ROLLBACK')
            raise AssertionError('foreign mutation was allowed: '+sql)
    conn.execute('BEGIN IMMEDIATE')
    conn.execute('INSERT INTO task_comments(task_id,body) VALUES(?,?)',('same','Yes'))
    conn.execute('COMMIT')
    assert conn.execute('SELECT body FROM task_comments').fetchone()[0] == 'Yes'
    conn.close()



def test_installed_entry_retains_delegation_guard_before_opening_db(tmp_path):
    import os
    source = os.environ.get('KANBAN_AUDIT_SOURCE', '/home/merquery/.hermes/hermes-agent')
    python = os.environ.get('KANBAN_AUDIT_PYTHON', source+'/venv/bin/python')
    if not Path(python).is_file():
        import pytest
        pytest.skip('installed Python unavailable')
    env = {**os.environ, 'HOME':str(tmp_path), 'HERMES_HOME':str(tmp_path), 'HERMES_KANBAN_DB':str(tmp_path/'absent.db'), 'KANBAN_HERMES_SOURCE':source, 'HERMES_DELEGATED_CHILD_CONTEXT':'1'}
    result = subprocess.run([python,str(WRITER),'--protocol','game-dev-write-v1','--database',str(tmp_path/'absent.db'),'--game','fps-gauntlet','--','kanban','--board','default','comment','same','denied'],env=env,text=True,capture_output=True)
    assert result.returncode != 0
    assert 'delegate_task child contexts cannot mutate' in result.stderr
    assert not (tmp_path/'absent.db').exists()



def test_own_committed_archive_allows_installed_lifecycle_followup_but_not_external_archive(tmp_path):
    db = tmp_path/'tasks.db'
    with sqlite3.connect(db) as c:
        c.executescript('CREATE TABLE tasks(id TEXT PRIMARY KEY,body TEXT,status TEXT,idempotency_key TEXT);')
        c.execute('INSERT INTO tasks VALUES(?,?,?,NULL)',('same',body('fps-gauntlet'),'done'))
    conn=load_writer().open_scoped_connection(db,'fps-gauntlet',['same'])
    conn.execute('BEGIN IMMEDIATE')
    conn.execute("UPDATE tasks SET status='archived' WHERE id='same'")
    conn.execute('COMMIT')
    conn.execute('BEGIN IMMEDIATE')  # installed archive's recompute_ready txn
    conn.execute('COMMIT')
    conn.close()
    fresh=load_writer().open_scoped_connection(db,'fps-gauntlet',['same'])
    try:
        fresh.execute('BEGIN IMMEDIATE')
    except PermissionError:
        pass
    else:
        raise AssertionError('preexisting archived target authorized')
    fresh.close()



def test_transaction_membership_uses_canonical_metadata_parser_not_game_id_alone():
    writer=load_writer()
    assert writer.game_of(body('fps-gauntlet')) == 'fps-gauntlet'
    invalid = [body('fps-gauntlet').replace('"qa"','"INVALID"'), 'prefix'+body('fps-gauntlet'),
               '```game-dev\n'+json.dumps({'game_id':'fps-gauntlet'})+'\n```',
               '```game-dev\n'+json.dumps(dict(game_id='fps-gauntlet',milestone='Test',discipline='qa',capture={'version':1}))+'\n```']
    for value in invalid:
        assert writer.game_of(value) is None, value



def test_external_sql_writer_cannot_reclassify_until_authorized_transaction_commits(tmp_path):
    db=tmp_path/'tasks.db'
    with sqlite3.connect(db) as c:
        c.executescript('CREATE TABLE tasks(id TEXT PRIMARY KEY,body TEXT,status TEXT,idempotency_key TEXT); CREATE TABLE task_comments(task_id TEXT,body TEXT);')
        c.execute('INSERT INTO tasks VALUES(?,?,?,NULL)',('same',body('fps-gauntlet'),'triage'))
    conn=load_writer().open_scoped_connection(db,'fps-gauntlet',['same'])
    conn.execute('BEGIN IMMEDIATE')
    external=subprocess.run([sys.executable,'-c', 'import sqlite3,sys; c=sqlite3.connect(sys.argv[1],timeout=.05); c.execute("UPDATE tasks SET body=?",(sys.argv[2],)); c.commit()',str(db),body('snowdown')],text=True,capture_output=True)
    assert external.returncode != 0 and 'database is locked' in external.stderr
    conn.execute('INSERT INTO task_comments VALUES(?,?)',('same','Authorized before reclassification'))
    conn.execute('COMMIT')
    conn.close()
    with sqlite3.connect(db) as c:
        assert c.execute('SELECT count(*) FROM task_comments').fetchone()[0] == 1
        assert c.execute('SELECT body FROM tasks').fetchone()[0] == body('fps-gauntlet')
        assert c.execute('SELECT count(*) FROM sqlite_master WHERE type="trigger"').fetchone()[0] == 0
