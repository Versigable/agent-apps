# Shared scoped Game Dev WRITE backend — source checkpoint

**Current editable backend follow-up:** [activation contract](game-dev-editable-activation.md) adds the actual installed-Hermes transactional scoped writer, app-CSRF browser sessions and trusted shared asset routes. N1 source repair is independently APPROVED by the external `operator-write-n1-review.md`; the older REQUEST_CHANGES report is superseded for N1. Earlier checkpoint limitations below are historical unless retained in the current contract. Deployment/authenticated acceptance is not claimed.

**Later source-only security checkpoint:** [operator HTTP security](operator-http-security.md) implements exact Origin/JSON/CORS/Host routing in the shared dispatcher, pending independent review and deployment. Earlier statements below that security implementation is still owed describe the prior checkpoint. Session-bound CSRF and independent approval/installed-adapter verification of WRITE remediation remain scoped-editing gates; they do not block security/static cutover while editing stays disabled. No live protection or editable migration completion is claimed.

**Not activated; not the full editable migration.** The general app adapter and the scoped Game Dev adapter now call shared operations in the **same operator process**, targeting the same authoritative task IDs, comments/events and database. No task copying, second service, schema migration, HTTP upload, or new lock map. Target topology remains protected gamedev + app-preview on existing **4175**, public standalone game-preview on **4173**.

## Navigation / owning code

- [`game-dev-api.mjs`](../scripts/game-dev-api.mjs): bounded scoped HTTP adapter; never imports or forwards to the general router.
- [`kanban-writes.mjs`](../scripts/kanban-writes.mjs): `createTask`, `writeTask`, `writeLink`, `withTaskLocks`, `storeIdentity`; shared authorization timing, serialization and persisted verification.
- [`kanban-commands.mjs`](../scripts/kanban-commands.mjs): extracted existing validators and CLI argument construction, reused by both adapters. Board administration and high-friction dispatch/claim remain solely on the general adapter.
- [`kanban-operations.mjs`](../scripts/kanban-operations.mjs) and [`kanban-readonly.py`](../scripts/kanban-readonly.py): exact-target, archive-aware readback and projections. The internal read-only `--write-snapshot` additionally reads idempotency/workspace/runtime/skills and original `created` event intent; it is not exposed as an HTTP route.
- [`kanban-evidence.mjs`](../scripts/kanban-evidence.mjs): the **existing single lock Map**, imported by shared operations. No second evidence-lock instance is created.
- [`game-dev-write.node.mjs`](../tests/game-dev-write.node.mjs): real temporary SQLite + deliberately synthetic CLI protocol fixture; [`operator-fixture.py`](../tests/helpers/operator-fixture.py) is **not installed Hermes write evidence**.

## Gates and compatibility

Scoped writes require all of `GAME_DEV_READS_ENABLED=true`, `GAME_DEV_WRITES_ENABLED=true`, explicit `KANBAN_MODE=live`, and an explicitly false `KANBAN_READONLY`. Defaults remain disabled. These are deployment gates, **not authentication, Origin protection, or CSRF protection**. No production environment, listener, routing or service was changed.

Both adapters share command implementation and task/evidence/dependency locks. The general adapter retains its established create command-response contract **while the scoped write gate is off**, so this checkpoint does not silently replace existing app behavior. When the scoped gate is enabled, **both adapters** use the stronger persisted create/idempotency readback path. Do not treat the legacy general create response as new independently verified persistence. Existing general board/diagnostic/execution controls remain available under their existing controls; no general router is mounted on Game Dev. General CLI detail still has the previously documented initialization side effects; remediation remains a separate integration decision.

## Scoped route contract

Prefix: `/api/game-dev/games/:registered-game`.

| POST route | Payload / behavior |
| --- | --- |
| `/tasks` | Existing title/body/game_dev creation fields; `game_dev.game_id` must equal route. Exactly one server-encoded canonical metadata fence; caller body fences rejected. Scoped creation is triage-only; direct creation remains on general app controls. |
| `/tasks/:id/comments` | `text`, optional `author` attribution label. Returns exact persisted detail, including original comment/event IDs. Labels are not authenticated identity. |
| `/tasks/:id/actions` | `action`: assign (empty/null assignee unassigns), block, unblock, complete, archive, reassign, reclaim, edit. Action-specific fields only; no status/body/classification editor. |
| `/links` | `action` link/unlink, `parent_id`, `child_id`. Distinct same-game endpoints only, each reauthorized; returns both persisted details. |
| `/tasks/:id/evidence` | Existing strict evidence record schema, including `id`. Server stamps operator-reported source, timestamp and game. Returns persisted record, never an optimistic echo. |

Unknown fields, board overrides, mismatched game, invalid field types, queries, encoded/invalid IDs, unknown routes and broad execution/diagnostic paths fail closed. Missing/general/foreign task targets yield indistinguishable scoped 404s. Errors are sanitized and scoped responses do not grant CORS. Bounded JSON parsing has a 128000-byte request limit; **Content-Type and exact Origin are enforced by the separate dispatcher security slice**, whose deployment/acceptance is not established by these adapter tests.

Capture is ordinary shared creation: validated PNG only (existing decoder/chunk/dimension/decompression checks), explicit nullable build identity, unassigned triage and required retry key. The encoded attachment-bearing body must fit the existing **100000 UTF-8-byte** cap, not just a JavaScript character count. Existing general creation field limits and attribution are retained. Scoped scalar/list/boolean fields are strict. Ordinary metadata-only task body limit remains 8000 characters; the bounded request also limits bytes.

## WRITE review remediation (source only)

- General detail supplements installed CLI `show` with original persisted comment/event IDs and dependency rows through `readTaskHistory` and internal read-only `--general-task <task-id>`. The former board-wide `--general-snapshot` path was removed after N1: unrelated archived history could exhaust the general detail subprocess budget even with scoped gates off. Every history/dependency query now binds the exact target as a SQL parameter, including archived targets; absent targets return null before history reads. General raw event fields (including `run_id`) and decoded JSON payloads/non-JSON payload strings survive. Comments follow installed `created_at ASC`, events `created_at ASC,id ASC`, dependencies lexical ID order. CLI task/run/log/context fields are not replaced; no unrelated bodies, events or completed runs are read by this helper. Scoped projection is unchanged. This fixes committed actions/repeated comments returning false verification failures without inventing history IDs or trusting stdout.
- Command preparation lowercases assignees. Assign/reassign interpret empty/null and case-insensitive `none`, `-`, `null` as unassignment; create retains installed create semantics (profile names are lowercased, not action aliases). Directory workspace paths are stripped and expanded with the same Python `os.path.expanduser` semantics before command generation and retry comparison; relative paths are not silently resolved. Existing scratch/worktree support is unchanged.
- Identical keyed retries validate target intent and all parent memberships under deterministic endpoint locks. An archived same-game parent is allowed only for that existing read-only return; new relationships, conflicting intent and foreign/reclassified parents still fail.
- Latest completed-run selection follows installed edit order: `COALESCE(ended_at,started_at,0) DESC,id DESC`, including backfilled histories.

These are source corrections with isolated regression coverage, not activation approval. The inherited repo-brain map evidence remains explicitly stale; no runtime evidence hashes/dates are refreshed by this remediation.

## Management semantics and readback

- Scope is fixed to `default`, independent of `KANBAN_BOARD` and caller payload/query. Registered catalog and task classification are re-read **inside acquired locks**. Canonical process DB/HOME overrides are trusted configuration, not request inputs.
- Unknown task statuses survive reads. Assignment/archive can still manage unknown statuses. Scoped transition checks track the inspected installed contract: block from running/ready, unblock from blocked/scheduled, complete from running/ready/blocked/review, edit only done, reclaim from running. Running assignment requires explicit reassign+reclaim. The CLI retains its own final transition/dependency checks.
- Block-loop escalation to triage is a legitimate persisted outcome. `edited`, `reclaimed`, and `block_loop_detected` **headers only** join the projected history. Completion readback explicitly projects task result and completed-run summary/metadata, not raw runs/logs/context; these are authored task content, not a DLP boundary.
- Scoped archived targets are read-only for new comments/evidence, management and dependency changes. Repeated archive is a verified no-op; an identical already-persisted evidence retry and unchanged create-key retry may return the archived original. Archive reads back exact detail, not the active board list.
- Ordinary actions require a new matching persisted event and expected resulting state. Comments require a new persisted matching comment. Evidence requires the exact stamped body/record in persisted readback. Dependency verification checks both persisted directions. A dropped write is an error, never success.
- Existing CLI lifecycle effects are **not removed or mislabeled**: intentional unblock/reclaim can return a task to ready; archive/complete/link may cause installed readiness/lifecycle behavior, including effects on pre-existing relationships. The scoped adapter adds no dispatch, claim, read-side promotion or cron. Installed lifecycle effects and cross-game legacy relationships require integration review before activation; a constrained HTTP endpoint is not a sandbox around the installed CLI.

## Locks, retries, and explicit external-process limit

The shared evidence module's lock queue is reused for **all participating adapter task writes**. Keys encode canonical resolved database path and task identity; a board's physical DB path is its identity. Explicit DB overrides and symlink aliases converge. Configuration/DB location must remain stable while serving. This is not protection against arbitrary hard-link aliases or DB replacement.

Dependencies acquire both distinct task IDs in sorted order. Creation acquires a store-wide per-key creation lock, discovers any retry target, then acquires parents and retry target in one deterministic pass and re-reads membership/identity. It does not recursively lock an already-held target. Evidence validation, duplicate checks, write and exact readback are serialized together; both adapters share this queue.

Create-key conflicts compare canonical body/title, original created-event triage/assignee/tenant/parents, and persisted priority/workspace/runtime/skills. Original creation events permit retries after assignment/archive without using the changed status as original intent. Ambiguous/missing historical intent fails closed rather than silently treating a changed request as a duplicate. Archived keys are not silently recycled. Failed unpersisted writes release locks; committed lost responses are recovered by persisted key/record lookup. Evidence conflicts return 409; duplicates do not append. Fresh-process sequential retry tests establish **persisted** identity rather than an in-memory response cache.

**Current guarantee boundary:** the Map still coordinates only these adapters, but scoped commands now require the [transaction-authorizing installed writer](game-dev-editable-activation.md). Its SQLite write lock, inside-transaction target checks and connection-local row triggers close external reclassification before mutation commit. External writers can still change classification AFTER that authorized commit, causing readback failure; the retained adversarial fixture models that later case. It cannot undo an earlier commit. Whole-request atomicity and cross-process exactly-once claims are not made.

Activation now requires the actual repo-owned transaction-capable installed writer and its independent source/installed compatibility review; a claimed exclusive-ownership environment flag is not offered. Do not solve this with a copied DB, another lock Map, `immutable=1`, or a delegation-guard bypass. Ordinary comments/actions without dedicated retry keys remain non-exactly-once operations: refresh authoritative state after ambiguous failure; do not blindly auto-replay them.

## Verification surfaces and limits

`npm run test:operator` runs the read and write Node suites explicitly and is wired into the existing CI job (CI integration freeze released for this change). The optional installed-schema read test skips only when no installed source is supplied. `KANBAN_AUDIT_SOURCE=<installed-source> KANBAN_AUDIT_PYTHON=<installed-python> npm run test:operator:installed` requires the source variable and must run zero-skip where that source is available. It imports installed schema only to seed temporary synthetic rows; it does not prove the installed writer succeeded.

The isolated installed CLI create probe in this checkpoint returned exit **1**, empty stdout, exactly:

```text
kanban: delegate_task child contexts cannot mutate Kanban tasks via the CLI
```

The guard was retained. The isolated task count stayed zero and DB fingerprint was unchanged for this delegated write probe. This differs from the earlier read-helper initialization audit and does not overwrite that evidence.

**Superseding main-session receipt:** the parent subsequently ran the actual installed CLI in a disposable HOME/DB with its inherited guard environment untouched. `operator-write-evidence/main-cli-roundtrip.json` in the external game-build-downloads project records passed create + identical-key retry, exact **100000 UTF-8-byte** capture-bearing body persistence, comment, link/unlink, ready→blocked→ready→done→edited result→archived, with final **2 tasks, 2 comments, 13 events**. Script: `operator-main-cli-roundtrip.py`; initial receipt: `main-session-cli.json`. The tiny valid PNG plus padding establishes CLI argument/body size, not maximal-image upload. No dispatch/claim was run.

That receipt exercises direct CLI commands, **not either HTTP adapter or the shared verifier**. Remediation fixtures deliberately reproduce installed `show` field projections/canonicalization but are synthetic. Actual installed adapter proof remains parent-owned; no delegated guard bypass or installed-mutation success is claimed here.

The scoped read/write snapshots still materialize default-board history under an 8 MiB subprocess output bound; realistic scoped capacity validation remains open. General exact-target history retains the same 8 MiB bound: a target's own oversized history still needs a separate bounded-history/pagination decision. The N1 regression seeds 1,100 unrelated archived comments of 8,000 bytes each and verifies small-target general GET, repeated comments, assignment/block/unblock/archive and original-ID readback with both scoped gates explicitly false. Separate tests cover archived exact lookup, missing/injection-like IDs, board resolution, read failures, chronology and raw event fields. These are synthetic persisted adapter tests, not installed writer or network/ingress evidence. Existing app regressions, static/publisher regression and repository-map checks are separate evidence, not authentication or deployment receipts.

## Owner update received during this checkpoint / required next stage

Owner-reported final infrastructure receipts supersede earlier host-only-cookie/new-provider proposals:

- Domain-wide Authentik **Hokagis** operator gate exists for gamedev and app-preview: MetaVersig, Firekube and accepted break-glass ultradmin; anonymous and EnchantedGamesDevs denied. Screenshots were supplied to the parent; this subagent did not independently probe ingress or inspect those images.
- Cookie is **domain-wide, not host-only**. Do not request a new provider/per-host policy or trust forwarded identity headers. Infrastructure **!112 is already merged by Eric**, with pipeline **286 reported passing**. These receipts do not complete application protection: exact configured Origin on **every 4175 write**, JSON-only Content-Type enforcement, removal of wildcard operator CORS, and gamedev Host scoping are still owed on **both 4175 hosts**. Session-bound CSRF/trusted backend-bypass and malicious-player browser tests remain part of security integration. These defenses must preserve general app controls; they were not silently activated here.
- Proposed separate security slice: shared entrypoint write middleware for both adapters and all other 4175 mutation paths, exact trusted origins/hosts, bounded JSON-only bodies and no wildcard CORS, with negative-origin/form/null-origin/host confusion tests asserting unchanged isolated DB. Follow with shared frontend transport and delayed-draft/navigation tests. Parent should own this slice and its review; it is not an infra policy decision blocker.
- Public **4173 must also serve published immutable versioned ZIPs read-only**, with exact digest, attachment and path-safety checks. This supersedes the earlier blanket no-native-store assumption. The frozen static package needs a **later separately reviewed extension** to its read-only release boundary; it was not changed in this checkpoint. No task-store access, operator writes or HTTP upload belongs there. Publishing remains operator-only.
- **Only MetaVersig and Firekube merge homelab-infra.** Claude Code reviews evidence/recommends, never merges and has no Maintainer token. Per corrected owner receipt (screenshot `1553571607203676192`), gamedev is live behind Hokagis but **currently aliases app-preview because Host scoping is absent**; hostname availability is not an editable scoped migration receipt. **!113 stays draft** until protections are **live on 4175**, static-only **4173** is established, and published-only digest-matched public ZIP downloads are reviewed. This checkpoint performs no infra merge/deployment and grants no activation authority to the child. OS isolation, process/store identity, cutover compatibility and editable user acceptance remain separate gates.

See [remaining migration](game-dev-operator-migration.md). Independent review of this WRITE checkpoint remains required; prior READ approval does not automatically cover these additions.
