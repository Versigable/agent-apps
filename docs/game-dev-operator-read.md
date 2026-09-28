# Game Dev operator read/domain checkpoint

**Implemented source only; not activated, reviewed, or a complete migration.** Full editable migration is still required by [the migration plan](game-dev-operator-migration.md). Approved topology: public static-only game-preview 4173; protected gamedev and existing app-preview share the same operator process/store on 4175. No historical player origin receives operator privileges.

## Contract

[`game-dev-api.mjs`](../scripts/game-dev-api.mjs) imports [`kanban-operations.mjs`](../scripts/kanban-operations.mjs), not the general HTTP router. Registered game IDs come from the existing browser/native catalog loader. Under `/api/game-dev/games/:game`:

| GET / HEAD | Projection |
| --- | --- |
| `/capabilities` | Fixed `default` board, implemented reads when enabled; always empty writes and execution false. |
| `/board` | Same-game active cards, scoped counts, unknown statuses retained as columns. No body, diagnostics, runs, logs, context, global event cursor or unrelated roster aggregates. |
| `/tasks` | Compatibility list of the same projected cards, no bodies. |
| `/tasks/:id` | Exact same-game task including archived task; authored body, explicit comment fields, validated operator-reported evidence, safe event headers and same-game dependency cards. |
| `/roster` | Configured operator names/roles and tenant names plus this game's card assignees/tenants. No workspace paths, profile inventory, unrelated board counts or task-derived foreign names. |

Catalog/build/download routes retain the previous contract. Any query parameter (including even `board=default`), unsupported route, invalid/unknown game or out-of-game task fails closed. Non-GET/HEAD methods return 405. Backend failures are sanitized; live errors never return fixture data. `GAME_DEV_READS_ENABLED` stays default-off and is a **deployment gate, not authentication**. Existing preview routing is unchanged and not suitable for making the broad historical games surface public. No host routing or auth acceptance is delivered here. The eventual standalone public static server has no operator imports/routes; new tests exercise denial with all operator flags enabled.

Task/comment IDs and timestamps remain original. Comments must belong to the selected task; their text and task bodies are authored operator content, not a content-redaction/DLP guarantee. Event projection is deliberately narrower than the general audit view: known creation/completion/archive/block/unblock/assignment/comment headers, plus `linked`/`unlinked` events only when both endpoints currently belong to the game. No arbitrary payloads, execution events, unknown events, or foreign-link events. Same-game link headers expose only parent/child IDs. Reclassified/deleted peers no longer qualify. Full raw history remains in the authoritative DB/general operator view; nothing is deleted or copied.

## Shared storage and read effects

General `liveBoard` now uses the same `readTaskSnapshot` subprocess helper. Its old default Python output and all app write/execution/detail handlers remain unchanged. The new `--snapshot` path in [`kanban-readonly.py`](../scripts/kanban-readonly.py) reads membership/history/links in one SQLite read transaction with `mode=ro` and `query_only=ON`, includes archived tasks for exact readback, and never imports Hermes initialization or calls recompute. It uses the existing trusted process HOME/HERMES_HOME/HERMES_KANBAN_HOME/HERMES_KANBAN_DB resolver, but always passes the explicit `default` board for scoped reads. Process DB overrides are trusted deployment configuration, never request inputs. No new DB, copy/sync store, lock map, service, or writable connection is introduced. Evidence parsing imports the existing module, leaving the single existing lock context available for the next write slice.

Installed-source inspection found that CLI `list` calls `recompute_ready`; `show` and `assignees` also use writable initialization. Isolated installed-schema probes of those CLI helpers returned a delegation mutation denial, **after DB bytes changed and an init lock appeared**. The guard was not disabled; no production HOME/DB was accessed. Thus these helpers are not suitable for scoped GETs. A successful full CLI-helper audit requires an authorized parent context; no readiness-promotion execution result is claimed here.

Installed schema also lacks `tasks.updated_at`; the reader selects only existing allowlisted task fields, rather than migrating. Isolated DELETE-journal batches preserved DB/sidecar fingerprints. WAL audit retained DB and WAL hashes and task state, but the first read changed SHM read-mark bytes; warmed repeated reads preserved all three hashes. Read-only SQLite is not a promise of zero shared-memory bookkeeping. No immutable-mode workaround is used because it could miss live WAL state.

## Verification and remaining gates

Run the portable suite with `node --test tests/game-dev-operator.node.mjs`. To include the installed-schema fixture contract, explicitly set `KANBAN_AUDIT_SOURCE` to a reviewed Hermes source checkout and `KANBAN_AUDIT_PYTHON` to its interpreter. That optional test initializes only a temporary SQLite fixture from installed schema, not a real Hermes operational board. It is skipped without that explicit source path. New tests are not yet wired into frozen CI; integration owner must add the command after the freeze is released.

Acceptance tests cover fixed board despite `KANBAN_BOARD=other`, registered games, cross-game/general task denial, unknown statuses, archived readback, history/link filtering, original IDs, HTTP query/method/encoding boundaries, roster projection, fail-closed missing DB, shared read loader and public-static denial. Existing build/browser/Python regressions remain required. See [the pre-edit plan](plans/operator-read-checkpoint.md).

Open: independent spec/security review; authorized installed CLI audit continuation; CI integration and remote CI; full scoped create/capture/management/evidence with cross-surface exact persisted readback; session-bound CSRF/exact Origin protections on both adapters; trusted host routing/shell/frontend transport; app GET side-effect remediation decision without disabling management; owner ingress/auth/backend isolation and real static OS-denial receipts; integration, deployment and user acceptance. No unit, listener, user, firewall, service, gameplay or production state change is included.
