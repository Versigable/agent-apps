# Editable operator activation — deployed contract

**Current status:** core editable board deployed from `editable-release/candidate` and user-confirmed by screenshot/message `1553915660910723232`. Both operator hosts retain the existing 4175 process/store. See [canonical migration status](game-dev-operator-migration.md#current-status--editable-board-deployed-and-user-confirmed) for exact acceptance accounting, public ZIP identity and remaining provenance limits.

Parent receipts in `/home/merquery/projects/game-build-downloads/` (`editable-release/verification.md`, `migration-completion-audit.md`) record 55 operator, 15 frontend and 64 general browser passes, 32 installed lifecycle calls and real Chromium/SQLite bidirectional proof. `build-catalog-live-closure.json` and `build-catalog-browser.json` supersede the audit’s empty-catalog finding: explicit `GAME_BUILD_STORE=/home/merquery/projects/game-build-downloads/release-gdp002-zip1/private-store` exposes the existing `gdp-002-kit-v0.1-zip1/linux-x64` build, with exact ZIP GET200 and both UI download links verified. The read-only local Host-mapped browser test is not ingress-authentication or production evidence-write proof. No current remote CI or committed/tagged provenance is claimed.

## Historical source checkpoint and continuing compatibility contract

The contract below preserves source implementation and its original pre-release checklist. “Before release” and pending installed/browser checks refer to that checkpoint, not the current accepted board deployment. Parent receipts supersede those pending statuses only within their stated scope; absent auth/media/provenance evidence remains absent. This documentation task changed no services, production data or immutable release notes.

## Authentication and CSRF are distinct

The selected architecture retains existing Hokagis forward-auth authorization on **every** operator request and the restricted backend network boundary. It does not invent Authentik session IDs, trust forwarded usernames, parse its domain-wide authentication cookie, or require a new provider. The separate application cookie below is **only a CSRF browser session**, never an operator identity. Upstream authorization—not this cookie's lifetime—enforces logout/revocation.

Decision evidence supplied to the backend implementer: external `editable-csrf-decision.md`, `editable-deployment-audit.md` sections 117–135 and `editable-firewall-receipt.md`. Parent reports current backend_guard rules limiting 4175 to loopback and three approved IPv4 peers, with other IPv4/IPv6 dropped, plus a timed-out denied-position probe. Historical owner operator/nonoperator matrix exists. These are parent/auditor receipts, not fresh authentication tests by this backend writer; all-method ingress and final authenticated browser acceptance remain release-owner checks.

### Transport

- `OPERATOR_CSRF_ENABLED=true` enables CSRF on **both operator hosts**. `GAME_DEV_WRITES_ENABLED=true` also enables it, even if the CSRF flag is false or the scoped writer is missing.
- `GET /api/operator/session` returns `{csrfRequired:true, csrfToken, expiresAt}` and, for a new session, `Set-Cookie: __Host-operator-csrf=<random>; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=1800`. No Domain attribute; cookie and token have independent 256-bit random values.
- Token is bound to the server-side session and the exact configured origin. Sessions expire after a fixed 30 minutes, are not renewed on reads/writes, and disappear on restart. A bounded 1024-entry process map prunes expired sessions; full capacity returns 503 instead of evicting active sessions. No DB/session service is introduced.
- Every operator POST, including general board administration and high-friction execution, must present that cookie and `X-Operator-CSRF` after the pre-existing exact Host/Origin, JSON Content-Type and Fetch Metadata policy passes. No operator CORS permission is added. Failure never reaches the database.
- Session GET refuses foreign/null Origin when supplied, contradictory Fetch Metadata, and non-GET methods. Ordinary same-origin GET may omit Origin. Duplicate raw Cookie/CSRF headers and duplicate reserved cookie names are rejected, rather than choosing an attacker-controlled sibling cookie. Malformed tokens cannot cause a timing-safe-comparison length exception.
- Frontends retain drafts and must not automatically replay failed POSTs. Fetch a token immediately before submission; token/session failures require explicit retry. Cookie lifetime is not a claim of Authentik login lifetime.
- General legacy compatibility: when both flags are off, discovery returns `{csrfRequired:false}` without cookies/tokens. The non-operator local preview also returns that no-session result, but **cannot activate scoped HTTP writes**, regardless of scoped flags. It is not an authenticated operator deployment.

Exact canonical host/origin pairing and JSON-only protection remain mandatory. The token is not a substitute for either. A non-browser administrator who can reach the trusted backend is inside the accepted administrative boundary; cookie possession does not authenticate them.

## Actual scoped writer

Source: [`game-dev-scoped-writer.py`](../scripts/game-dev-scoped-writer.py), called by the shared command layer using an async-local scope attached only to scoped operations. General operations still use their existing installed CLI. Same-process task/evidence locks and persisted readback remain shared.

Configuration required **in the same existing operator process**, after independent review:

```text
PREVIEW_SURFACE=apps
PREVIEW_PUBLIC_URL=https://app-preview.ninjaprivacy.org
GAME_DEV_PUBLIC_URL=https://gamedev.ninjaprivacy.org
GAME_DEV_READS_ENABLED=true
GAME_DEV_WRITES_ENABLED=true
OPERATOR_CSRF_ENABLED=true
KANBAN_MODE=live
KANBAN_READONLY=false
GAME_DEV_SCOPED_WRITER=<absolute release>/scripts/game-dev-scoped-writer.py
KANBAN_HERMES_SOURCE=<actual installed Hermes source>
KANBAN_PYTHON=<actual installed Hermes virtualenv>/bin/python
```

Retain the existing HOME/HERMES_HOME/HERMES_KANBAN_HOME/HERMES_KANBAN_DB and general HERMES_BIN resolution; never create a second store. The Node caller supplies its own executable for canonical metadata parsing. Missing/nonabsolute writer configuration leaves scoped writes unavailable; writer/interpreter/import/schema failure never falls back to the unguarded CLI.

The writer protocol is `--protocol game-dev-write-v1 --database <canonical existing DB> --game <registered game> -- kanban --board default <prepared command>`. The configured executable and installed source are trusted deployment code, not request inputs. Do not configure a wrapper that ignores this envelope.

### Transaction authorization, not a process-lock claim

1. Call the installed durable delegation guard **before opening any DB**; installed `write_txn` retains its own guard. No environment guard is removed and no installed source is edited.
2. Reuse the installed parser and the allowlisted installed action handlers. A dedicated single-command process supplies their connection context with one exact `mode=rw` SQLite handle. No `init_db`, schema migration, board creation, dispatcher or additional unguarded CLI connection is invoked.
3. Immediately after each successful `BEGIN IMMEDIATE`, authorize all command targets/parents/both dependency endpoints from that transaction's current rows. Missing, foreign, malformed or preexisting archived targets fail before mutation. Canonical membership uses the **same JavaScript parser**, including capture/raster validation, via a bounded subprocess; only pure body-parse results are cached, never task membership.
4. Connection-local **TEMP** SQLite triggers independently guard task, link and task-owned history/auxiliary row mutations. They check OLD and NEW task membership and both endpoints inside the write transaction. This also rejects foreign indirect lifecycle writes. Triggers are not installed persistently in the authoritative schema and do not interfere with general/external writers' own connections.
5. For create, an outer installed transaction is supported by installed create's explicit nested-savepoint contract. It serializes the early idempotency lookup and parent authorization; any concurrently appeared key (including archived) is rejected for refresh/retry instead of creating another scoped task.
6. Installed archive commits its target before `recompute_ready`. The connection records its **own** archived targets under the original transaction before successful COMMIT, permitting only that operation's subsequent same-game lifecycle work. This never exempts membership checks or permits a freshly/external archived target.

External SQL/CLI reclassification before lock acquisition is rejected; after acquisition SQLite prevents the competing write until the authorized transaction commits. This closes the mutation authorization window, unlike prior post-commit rechecks. General writers retain their authority and can subsequently reclassify tasks: readback may then reject an already-authorized committed write. That is not a foreign write at commit time and must not cause blind replay.

### Explicit limits

Installed actions may contain multiple transactions, post-commit readiness processing and workspace/lifecycle hooks. The helper preserves these semantics; **the whole HTTP request is not one rollback transaction**. Foreign indirect row writes fail closed and may make an operation fail after an earlier authorized transaction committed. General readiness effects are not silently granted to scoped code. No cross-process exactly-once guarantee is made for ordinary comments/evidence or for independent legacy creators that do not participate in scoped key serialization. Schema replacement, malicious privileged DB owners, hardlink replacement and arbitrary trusted-code edits are outside this row-authorization guarantee. Installed upgrades need renewed compatibility review of handler connection usage, transactions, schema and hooks.

The canonical parser subprocess runs while the write lock is held on a cache miss; each invocation has a three-second timeout and the outer command retains its existing ten-second bound. Large scoped snapshots still retain the existing 8 MiB limit. These are explicit capacity/failure limits, not silently raised buffers. General exact-target N1 behavior is unchanged.

## Trusted frontend assets and release ownership

Gamedev now serves the three `games/dev` shell files and exactly these shared `apps/kanban` files: `index.html`, `styles.css`, `app.js`, `game-dev.js`, `playtest-capture.js`, `build-evidence.js`, `evidence-validation.mjs`, `transport.js`. It still denies the general `/api/kanban` router, `/apps/kanban/` directory alias, roster JSON, arbitrary apps, game code and Three.js. Existing app-host management/execution routes remain.

Tests: existing `test:operator` Node suites plus `tests/test_game_dev_scoped_writer.py` under pytest; existing Kanban/preview browser regressions. Temporary SQLite fixtures exercise real transaction/trigger behavior and separate-process races. Synthetic CLI fixtures are not installed-Hermes success. Parent-owned installed lifecycle/browser receipts must be reported separately. The backend implementer can verify the installed denial guard but cannot bypass it to manufacture positive receipts.

Before release: independent source review; parent-installed lifecycle and shared-store UI tests; deployed all-method ingress/authorization and backend boundary confirmation; atomic rollout of both CSRF-aware frontends/backend; exact release/process/store identity and authenticated browser acceptance. Parent owns package/CI and repo-brain map updates; infrastructure merges remain human-owned. Never label source tests as live authenticated editing.
