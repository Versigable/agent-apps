#!/usr/bin/env python3
"""Synthetic CLI protocol fixture, NOT installed Hermes execution evidence.

Uses real temporary SQLite persistence; no Hermes imports or production paths.
"""
import json
import os
import sqlite3
import sys

DB = os.environ['HERMES_KANBAN_DB']
a = sys.argv[1:]
scope = None
if a[:2] == ['--protocol', 'game-dev-write-v1']:
    from pathlib import Path
    import importlib.util
    assert a[2] == '--database' and Path(a[3]).resolve() == Path(DB).resolve()
    assert a[4] == '--game' and a[6] == '--'
    scope, a = a[5], a[7:]
    cmd = a[3]
    targets = [a[i+1] for i,v in enumerate(a) if v == '--parent'] if cmd == 'create' else a[4:6] if cmd in ('link','unlink') else [a[-1] if cmd == 'reclaim' else a[-2] if cmd == 'reassign' else a[4]]
    spec = importlib.util.spec_from_file_location('scope_guard', os.environ['KANBAN_SCOPED_GUARD'])
    guard = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(guard)
    connection = guard.open_scoped_connection(DB, scope, targets)
    connection.execute('BEGIN IMMEDIATE')
else:
    connection = sqlite3.connect(DB)
with connection as c:
    c.row_factory = sqlite3.Row
    if a == ['--seed']:
        c.executescript('''
          CREATE TABLE tasks(id TEXT PRIMARY KEY,title TEXT,body TEXT,status TEXT,
            assignee TEXT,tenant TEXT,priority INT DEFAULT 0,created_at INT DEFAULT 1,
            idempotency_key TEXT,workspace_kind TEXT DEFAULT 'scratch',workspace_path TEXT,
            result TEXT,created_by TEXT, max_runtime_seconds INT,skills TEXT DEFAULT '[]');
          CREATE TABLE task_comments(id INTEGER PRIMARY KEY,task_id TEXT,body TEXT,author TEXT,created_at INT DEFAULT 1);
          CREATE TABLE task_events(id INTEGER PRIMARY KEY,task_id TEXT,kind TEXT,payload TEXT,created_at INT DEFAULT 1);
          CREATE TABLE task_links(parent_id TEXT,child_id TEXT,UNIQUE(parent_id,child_id));
          CREATE TABLE task_runs(id INTEGER PRIMARY KEY,task_id TEXT,outcome TEXT,summary TEXT,metadata TEXT,started_at REAL,ended_at REAL);
          CREATE TABLE calls(id INTEGER PRIMARY KEY,args TEXT);
        ''')
        for id, game, status in [('same','fps-gauntlet','triage'),('peer','fps-gauntlet','triage'),('foreign','snowdown','triage'),('general',None,'triage'),('old','fps-gauntlet','archived')]:
            body = '```game-dev\n'+json.dumps(dict(game_id=game,milestone='Test',discipline='qa'))+'\n```' if game else 'General'
            c.execute('INSERT INTO tasks(id,title,body,status) VALUES(?,?,?,?)',(id,id,body,status))
        c.commit()
        sys.exit(0)
    assert a[:2] == ['kanban','--board']
    c.execute('INSERT INTO calls(args) VALUES(?)',(json.dumps(a),))
    cmd = a[3]
    def arg(flag, default=None):
        return a[a.index(flag)+1] if flag in a else default
    def event(tid, kind, payload=None):
        c.execute('INSERT INTO task_events(task_id,kind,payload) VALUES(?,?,?)',(tid,kind,json.dumps(payload or {})))
    def task(tid):
        row=c.execute('SELECT * FROM tasks WHERE id=?',(tid,)).fetchone()
        if not row:
            raise ValueError('missing fixture task')
        return dict(row)
    def profile(value):
        return value.strip().lower() if value else None
    if cmd == 'create' and os.environ.get('OPERATOR_DROP_WRITE'):
        print(json.dumps(dict(id='unpersisted'))); c.commit(); sys.exit(0)
    if cmd == 'create':
        key=arg('--idempotency-key')
        row=c.execute("SELECT * FROM tasks WHERE idempotency_key=? AND status!='archived'",(key,)).fetchone() if key else None
        if not row:
            import uuid
            tid='t_'+uuid.uuid4().hex[:8]
            c.execute('INSERT INTO tasks(id,title,body,status,assignee,tenant,priority,idempotency_key,created_by) VALUES(?,?,?,?,?,?,?,?,?)',(tid,a[4],arg('--body'),'triage' if '--triage' in a else 'ready',profile(arg('--assignee')),arg('--tenant'),int(arg('--priority','0')),key,arg('--created-by')))
            workspace=arg('--workspace','scratch').strip()
            kind, _, workpath=workspace.partition(':')
            runtime=arg('--max-runtime')
            if runtime:
                import re
                match=re.fullmatch(r'(\d+)([smhd]?)',runtime)
                assert match is not None
                runtime=int(match[1])*{'':1,'s':1,'m':60,'h':3600,'d':86400}[match[2]]
            skills=list(dict.fromkeys(a[i+1] for i,v in enumerate(a) if v=='--skill'))
            c.execute('UPDATE tasks SET workspace_kind=?,workspace_path=?,max_runtime_seconds=?,skills=? WHERE id=?',
                      (kind,os.path.expanduser(workpath.strip()) if workpath else None,runtime,json.dumps(skills),tid))
            for i, token in enumerate(a):
                if token == '--parent':
                    c.execute('INSERT INTO task_links VALUES(?,?)',(a[i+1],tid))
            event(tid,'created',dict(status='triage' if '--triage' in a else 'ready',assignee=profile(arg('--assignee')),tenant=arg('--tenant'),parents=[a[i+1] for i,v in enumerate(a) if v=='--parent']))
            row=task(tid)
        print(json.dumps(dict(row)))
    elif cmd in ('link','unlink'):
        parent,child=a[4:6]
        if not os.environ.get('OPERATOR_DROP_WRITE'):
            if cmd=='link':
                c.execute('INSERT OR IGNORE INTO task_links VALUES(?,?)',(parent,child))
            else:
                c.execute('DELETE FROM task_links WHERE parent_id=? AND child_id=?',(parent,child))
            for tid in (parent,child):
                event(tid,'linked' if cmd=='link' else 'unlinked',dict(parent=parent,child=child))
        print('linked')
    elif cmd in ('assign','reassign','block','unblock','complete','edit','archive','reclaim'):
        tid=a[-1] if cmd=='reclaim' else a[-2] if cmd=='reassign' else a[4]
        current=task(tid)
        kind=dict(assign='assigned',reassign='assigned',block='blocked',unblock='unblocked',complete='completed',edit='edited',archive='archived',reclaim='reclaimed')[cmd]
        if not os.environ.get('OPERATOR_DROP_WRITE'):
            if cmd in ('assign','reassign'):
                assignee=a[-1] if cmd=='reassign' else a[5]
                c.execute('UPDATE tasks SET assignee=? WHERE id=?',(None if assignee.lower() in ('none','-','null') else assignee.lower(),tid))
                if '--reclaim' in a:
                    c.execute("UPDATE tasks SET status='ready' WHERE id=?",(tid,))
                    event(tid,'reclaimed')
            elif cmd in ('complete','edit'):
                c.execute("UPDATE tasks SET status='done',result=? WHERE id=?",(arg('--result'),tid))
                latest=c.execute("SELECT id FROM task_runs WHERE task_id=? AND outcome='completed' ORDER BY COALESCE(ended_at,started_at,0) DESC,id DESC LIMIT 1",(tid,)).fetchone()
                if cmd=='edit' and latest:
                    c.execute('UPDATE task_runs SET summary=?,metadata=COALESCE(?,metadata) WHERE id=?',(arg('--summary',arg('--result')),arg('--metadata'),latest['id']))
                else:
                    c.execute('INSERT INTO task_runs(task_id,outcome,summary,metadata) VALUES(?,?,?,?)',(tid,'completed',arg('--summary',arg('--result')),arg('--metadata')))
            else:
                status=dict(block='blocked',unblock='ready',archive='archived',reclaim='ready')[cmd]
                if cmd=='block' and os.environ.get('OPERATOR_BLOCK_LOOP'):
                    status='triage'; kind='block_loop_detected'
                c.execute('UPDATE tasks SET status=? WHERE id=?',(status,tid))
            event(tid,kind)
        print('updated')
    elif cmd == 'comment':
        if not os.environ.get('OPERATOR_DROP_WRITE'):
            c.execute('INSERT INTO task_comments(task_id,body,author) VALUES(?,?,?)',(a[4],a[5],arg('--author')))
            event(a[4],'comment_added')
        print('added')
    elif cmd == 'show':
        tid=a[4]
        print(json.dumps(dict(task=task(tid),latest_summary=(c.execute('SELECT summary FROM task_runs WHERE task_id=? ORDER BY COALESCE(ended_at,started_at,0) DESC,id DESC LIMIT 1',(tid,)).fetchone() or [None])[0],comments=[dict(r) for r in c.execute('SELECT author,body,created_at FROM task_comments WHERE task_id=?',(tid,))],events=[dict(r) for r in c.execute('SELECT kind,payload,created_at,NULL AS run_id FROM task_events WHERE task_id=?',(tid,))],dependencies=dict(parents=[r[0] for r in c.execute('SELECT parent_id FROM task_links WHERE child_id=?',(tid,))],children=[r[0] for r in c.execute('SELECT child_id FROM task_links WHERE parent_id=?',(tid,))]))))
    else:
        raise ValueError('unimplemented synthetic fixture command: '+cmd)
    if os.environ.get('OPERATOR_RECLASS_AFTER_WRITE') and cmd=='comment':
        c.commit()
        with sqlite3.connect(DB) as external:
            external.execute('UPDATE tasks SET body=? WHERE id=?',('External classification change',a[4]))
    if os.environ.get('OPERATOR_LOSE_REPLY') and cmd != 'show':
        c.commit()
        raise SystemExit('synthetic lost reply after commit')
