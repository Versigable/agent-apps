# Request routing — `handler`

> STALE: Baseline dispatcher, consumer and test evidence predates the deployed editable operator and published ZIP integration. Current deployment receipts are linked separately; they do not semantically reverify this historical source map. Retain baseline revision/date/hashes until source and incoming consumers are reinspected. Semantic review owner unknown; parent owns release/CI provenance.

## Current deployment navigation — receipt-backed, not baseline re-verification

The editable board is deployed from `editable-release/candidate` and user-confirmed (`1553915660910723232`). Gamedev and app-preview share operator4175/store; public static4173 remains separate. The existing native build catalog and exact operator ZIP download are now live, backed by `build-catalog-live-closure.json` and read-only `build-catalog-browser.json` in the external project. Follow [canonical migration status](../game-dev-operator-migration.md#current-status--editable-board-deployed-and-user-confirmed) for acceptance, exact ZIP identity, receipt paths and limitations, then [editable activation](../game-dev-editable-activation.md) for writer/CSRF/frontend contracts. No current remote CI or committed-release provenance is asserted.

## Historical map and source checkpoints

All baseline behavior, line numbers, “not activated”, aliasing, pending-review and runtime-not-checked statements below describe the recorded source/checkpoint scope, not current service status. Source fingerprints remain stale: this receipt refresh does not claim full source or incoming-consumer reinspection.

**Source revision:** `a3da91f69d24c14f6612b2a1fcdae7d2abb4f1b4` · **Verified on:** 2026-09-24 (static inspection) · **Evidence:** verified-at-revision · **Implementation:** live/wired source · **Runtime:** not checked · **Owner / approval owner:** unknown.

## Purpose and connections

[`scripts/preview-service.mjs`](../../scripts/preview-service.mjs), `http.createServer` and `handler` (lines 105–153), dispatch HTTP requests to the Kanban bridge, redirects, health, a game manifest wrapper, or static files. [`package.json`](../../package.json), `scripts.serve:preview` and `scripts.serve:games`, invoke this same file. Despite its name, `serve:games` only sets the bind host; it does **not** set `PREVIEW_SURFACE=games`.

`previewSurface` defaults to `all`; `servesApps` and `servesGames` (lines 13–21) recognize exact values. This setting is read at process initialization. The following summarizes source behavior, not live endpoint probes:

| Surface | `/` (302 destination) | Static namespaces | `/api/kanban/…` | `/__preview/manifest` |
| --- | --- | --- | --- | --- |
| `all` (default) | `/games/arcade/` | apps, games, Three.js build | delegated to bridge | game registry + `resolvedAt` |
| `apps` | `/apps/` | apps | delegated to bridge | 403 |
| `games` | `/games/arcade/` | games, Three.js build | static fallback rejects with 403 | game registry + `resolvedAt` |

Unknown nonempty surface values make both predicates false: `/` still redirects to the arcade, static namespaces are denied, and health still returns `ok: true`. There is no startup surface validation in this file. Do not interpret successful health as configuration correctness.

## Ordered flow and invariants

All claims below cite [`scripts/preview-service.mjs`](../../scripts/preview-service.mjs) at the revision above:

1. `handler` checks the app-gated `/api/kanban/` prefix **before** static routing and calls `handleKanbanRequest(req, res, { repoRoot })`. Exposure is not write authorization; follow [the consumer boundary](preview-consumers.md).
2. Root redirect chooses the app dock only when `servesApps() && !servesGames()`. The arcade wins in combined mode. App-enabled `/apps` and `/apps/kanban` receive 308 trailing-slash redirects. Preserve slash behavior because launcher assets and manifest fetches use relative URLs.
3. `/healthz` is surface-independent; `healthPayload` (lines 46–61) reports `ok`, service, surface and conditional advertised URLs. No commit, bridge write flags, task-store probe or external dependency inventory is included. `PREVIEW_PUBLIC_URL` affects advertised URLs, not the request gate.
4. `/__preview/manifest` explicitly requires games, reads `games/manifest.json` and adds request-time `resolvedAt`; this is neither an app manifest nor a build/deployment timestamp. Apps use static `/apps/manifest.json` instead.
5. `safeStaticPath` (lines 63–81) decodes and normalizes paths, permits only the enabled `apps/`, `games/` and game-side `node_modules/three/build/` namespaces, rejects dot-prefixed segments and checks resolved repository containment. Preserve these checks when adding assets; this is not evidence of a comprehensive security audit.
6. `serveStatic` (lines 83–103) resolves directories to `index.html`, gives HTML/JSON `no-store`, other assets a 60-second public cache, and distinguishes denied paths (403) from missing allowed files (404). Handler failures reach the server's JSON 500 catch.

## Decisions and scoped change impact

- **Documented:** [README, “One-click internal preview”](../../README.md#one-click-internal-preview) describes independent app/game targeting. The tracked unit configuration and browser consumers are mapped [next](preview-consumers.md).
- **Inferred:** surface predicates centralize separation across routes and advertised links; trailing-slash normalization protects relative browser requests. **Unknown:** historical reason for arcade priority in `all`; no decision record was established in this inspection.
- Predicate changes affect API reachability, root selection, app slash redirects, static allowlists, manifest access, health fields and startup logging together. Review all these uses, not just the root conditional.
- Changing only the root destination does not directly change `safeStaticPath` or bridge capability computation in the inspected functions. It still changes browser navigation, and downstream/external effects are not proven absent.
- Adding Kanban to `games` is an API exposure change into the existing bridge, not merely a launcher link change. Do not broaden all app/static access accidentally or silently change bridge write/execution defaults.

## Verification and refresh

[`tests/preview-workflow.spec.mjs`](../../tests/preview-workflow.spec.mjs), at the same baseline:

- `preview surface mode separates app-preview from game-preview routes` (lines 126–159): apps root destination, slash redirect, health-field separation, both static surfaces, bridge health gate, and **apps-only manifest-wrapper 403** versus games 200.
- `preview service exposes health and denies repo-private paths` (lines 86–103): combined surface, manifests, Three.js and selected denied paths. These selected paths are not a complete traversal test.
- `app preview dashboard renders registered operator apps` and `arcade renders one-click preview and artifact actions`: immediate browser consumers.

**Last execution:** not run; assertions were read only. The inspected suite does not explicitly assert the combined-mode root redirect or invalid-surface behavior; those claims above come from source. Add focused coverage if changing them. See [index verification rules](index.md#verification-and-refresh-contract) before any authorized test run.

**Refresh when:** `handler`, surface predicates, static validation/cache behavior, advertised fields, manifest shape, entry scripts or route assertions change. Check the [consumer card](preview-consumers.md) in the same review.


## Public playable package — navigation, not re-verification

The opt-in [standalone static entrypoint](../../scripts/playable-service.mjs) reads only an [explicit asset registry](../../deploy/playable-registry.json); [offline staging](../../scripts/stage-playable.mjs) creates a separate public release. The [OS deployment runbook](../public-playable-deployment.md) and [system-unit template](../../deploy/systemd/agent-playable.service.in) require a dedicated unprivileged user outside operator home/store. Existing preview entrypoints remain unchanged. Follow [HTTP boundary tests](../../tests/playable-static.node.mjs), [export tests](../../tests/playable-stage.node.mjs), and [source/real-browser contract tests](../../tests/playable-contract.node.mjs). [Remaining editable migration](../game-dev-operator-migration.md) targets gamedev, not the public player origin. These inspected new paths do not refresh the older card evidence or prove live isolation; independent semantic review and activation receipts remain open.

## Scoped operator read/domain checkpoint — not activation

For a “discipline lane” detail without worker diagnostics, follow [the read contract](../game-dev-operator-read.md) → [`handleGameDevRequest`](../../scripts/game-dev-api.mjs) → [`gameBoard`, `gameTask`, `gameRoster`, `readTaskSnapshot`](../../scripts/kanban-operations.mjs) → [`kanban-readonly.py`](../../scripts/kanban-readonly.py). [`game-dev-operator.node.mjs`](../../tests/game-dev-operator.node.mjs) covers fixed default board, scoped history/dependencies, archived readback, unknown statuses, query/method denials and actual public-static API denial. General `liveBoard` shares the loader. The later shared WRITE checkpoint below supersedes the read-only write-status statement; general detail/execution and frontend controls remain. Read-only SQLite avoids CLI initialization/recompute; WAL read-mark bookkeeping is documented separately. The current preview route gate is unchanged and not an auth boundary. Full editable migration, protected-host wiring and deployed acceptance remain open. Baseline evidence metadata below is not refreshed by this navigation addition.

## Pending build-download integration

Follow [the staged surface contract](../game-build-downloads.md) to `handleGameDevRequest` in [game-dev-api](../../scripts/game-dev-api.mjs), `downloadBuild` in [game-build-store](../../scripts/game-build-store.mjs), and [the game dashboard](../../games/dev/index.html). Existing app Game Dev remains the active operator UI. The new backend task projection is default-disabled, with shared scoped writes now implemented but not activated; it is not the general bridge. Review [fixture route/download tests](../../tests/game-build-surface.node.mjs) before refreshing these baseline claims. This is a partial migration, not a deployment receipt.


## Shared WRITE backend — uncommitted source checkpoint

For a “playtest observation” or queued evidence retry, follow [the WRITE contract](../game-dev-operator-write.md) → [`createTask`, `writeTask`, `writeLink`](../../scripts/kanban-writes.mjs) → [shared command construction](../../scripts/kanban-commands.mjs) and [the one evidence lock module](../../scripts/kanban-evidence.mjs). Both [general](../../scripts/kanban-bridge.mjs) and [scoped](../../scripts/game-dev-api.mjs) adapters use these operations, not a general-router proxy. [Persisted bidirectional/concurrency tests](../../tests/game-dev-write.node.mjs) use a labeled [synthetic CLI fixture](../../tests/helpers/operator-fixture.py); installed CLI create was guard-denied, not successful. [`package.json`](../../package.json) and [CI](../../.gitlab-ci.yml) explicitly run the operator suites.

Scope fixed to default/game, after-lock reauthorization, exact archived-target readback, shared canonical DB/task keys and deterministic endpoint locking are source invariants. The Map does **not** fence outside processes; external membership races and installed lifecycle effects remain activation gates. No production services, frozen static/publisher/native assets, or editable frontend were changed. Current owner-reported infrastructure/cookie/public-ZIP requirements and human-only merge authority are centralized in [remaining migration](../game-dev-operator-migration.md#corrected-owner-receipts--current-next-stage-authority). Independent WRITE semantic review remains open; baseline map revision/date/hashes are intentionally not refreshed.
