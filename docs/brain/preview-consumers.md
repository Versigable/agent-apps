# Immediate consumers — reachability is not capability

> STALE: Baseline dispatcher, consumer and test evidence predates the deployed editable operator and published ZIP integration. Current deployment receipts are linked separately; they do not semantically reverify this historical source map. Retain baseline revision/date/hashes until source and incoming consumers are reinspected. Semantic review owner unknown; parent owns release/CI provenance.

## Current deployment navigation — receipt-backed, not baseline re-verification

The editable board is deployed from `editable-release/candidate` and user-confirmed (`1553915660910723232`). Gamedev and app-preview share operator4175/store; public static4173 remains separate. The existing native build catalog and exact operator ZIP download are now live, backed by `build-catalog-live-closure.json` and read-only `build-catalog-browser.json` in the external project. Follow [canonical migration status](../game-dev-operator-migration.md#current-status--editable-board-deployed-and-user-confirmed) for acceptance, exact ZIP identity, receipt paths and limitations, then [editable activation](../game-dev-editable-activation.md) for writer/CSRF/frontend contracts. No current remote CI or committed-release provenance is asserted.

## Historical map and source checkpoints

All baseline behavior, line numbers, “not activated”, aliasing, pending-review and runtime-not-checked statements below describe the recorded source/checkpoint scope, not current service status. Source fingerprints remain stale: this receipt refresh does not claim full source or incoming-consumer reinspection.

**Source revision:** `a3da91f69d24c14f6612b2a1fcdae7d2abb4f1b4` · **Verified on:** 2026-09-24 (static inspection) · **Evidence:** verified-at-revision · **Implementation:** live/wired source; units are tracked configuration, not observed installation · **Runtime:** not checked · **Owner / approval owner:** unknown.

## Consumer map

Every citation below refers to the source revision above. Start with [request routing](preview-routing.md) for the upstream gate.

| Consumer / configuration | Load-bearing source and relationship | First-order impact |
| --- | --- | --- |
| App dock | [`apps/app.js`](../../apps/app.js), `loadManifest` fetches `./manifest.json`; `renderApp` renders registry launch/health/preview links | App path/slash or registry shape changes can break loading/navigation. It does not fetch `/__preview/manifest`. |
| Game arcade | [`games/arcade/app.js`](../../games/arcade/app.js), `loadManifest` fetches `../manifest.json`; `manifestRelativeUrl`, `loadScorecard`, `renderGame`, `artifactLinks` resolve game/scorecard/artifact links | Game namespaces and relative-path changes affect launcher, scorecards and artifacts. It also does not fetch the wrapper endpoint. |
| Kanban bridge | [`scripts/kanban-bridge.mjs`](../../scripts/kanban-bridge.mjs), `handleKanbanRequest` (828–978) consumes delegated API traffic | Widening the games API gate exposes the existing read/write route family, subject to bridge capability checks; it does not create a games-specific bridge. |
| Kanban UI | [`apps/kanban/app.js`](../../apps/kanban/app.js), `writesEnabled`, `executionEnabled` | UI eligibility uses board read-only/write flags and execution state, not generic preview health. Backend enforcement remains necessary. |
| Capture tool | [`scripts/capture-game-video.mjs`](../../scripts/capture-game-video.mjs), `healthOk`, `ensurePreviewServer`, `main` | Reuses a server on successful `/healthz` status, otherwise spawns preview; separately reads local game registry and navigates a game. Health alone cannot establish that its target surface/game is usable or matches local code. |
| CLI health command | [`package.json`](../../package.json), `scripts.preview:health`; [`scripts/preview-service.mjs`](../../scripts/preview-service.mjs), `healthcheck` | Fetches loopback `/healthz`, requires successful HTTP status and parses JSON; no revision or bridge-capability validation. |
| Deployment templates | [`agent-app-preview.service`](../../deploy/systemd/user/agent-app-preview.service), `[Service]`, sets apps/4175 and write/execution flags; [`agent-apps-preview.service`](../../deploy/systemd/user/agent-apps-preview.service), `[Service]`, sets games/4173 | Both run `serve:preview`. Changes to flags, route defaults or entry command require reviewing both units; tracked values do not prove installed configuration. |

## Capability invariants and downstream boundary

[`scripts/kanban-bridge.mjs`](../../scripts/kanban-bridge.mjs) is authoritative for this boundary:

- `resolveMode` (91–96) honors explicit fixture/live; otherwise test port 4174 or `CI` selects fixture, with live as fallback. Set fixture mode explicitly for isolated verification rather than assuming a custom test port is safe.
- `readOnlyMode`, `writesEnabled` (98–104) require live mode and an explicitly false `KANBAN_READONLY` for writes. Fixture stays read-only even with that operator flag. `requireWritable` (563–574) rejects writes independently of the UI.
- `executionEnabled` (106–108) additionally requires `KANBAN_EXECUTION_ENABLED`; generic route access must not silently enable execution.
- `handleKanbanRequest`'s GET `/api/kanban/health` reports mode/board/capabilities and allowed-write names. This branch computes configuration-derived flags; it does not exercise the task backend. It is different from `/healthz`, and neither establishes a deployed commit.
- `loadBoard` selects fixture or `liveBoard`; `liveBoard` invokes the Python reader. `runHermesRaw` / `runHermesKanban` invoke the Hermes executable for downstream operations (498–539). **Boundary:** subprocess implementations and live stores are not mapped or exercised here; inspecting this connection is not proof those dependencies work.

**Documented rationale:** [README, “Current projects”](../../README.md#current-projects) directs operator apps to the app surface; its preview section explains independent targeting. **Inferred rationale:** separate reachability and capability checks prevent a surface change from becoming an implicit write-policy change. **Unknown:** approval ownership and any external consumer contract not represented in these inspected files.

## Scoped impact and verification

For an API exposure change, review `handler` plus `handleKanbanRequest`, mode/write/execution guards, UI capability handling and both unit templates. For a static/manifest change, review both launcher fetches and capture's local registry use. Within those launcher fetch functions, no `/__preview/manifest` consumer was found; that is **not** evidence that the wrapper has no other or external clients.

[`tests/preview-workflow.spec.mjs`](../../tests/preview-workflow.spec.mjs) is the focused regression starting point:

- `preview surface mode separates app-preview from game-preview routes`: upstream API gate and manifest/static separation.
- `kanban fixture mode honestly disables writes despite the operator flag`: GET capability flags, POST rejection (423), disabled UI creation with `KANBAN_READONLY=false` in fixture mode.
- `app preview dashboard renders registered operator apps`, `arcade renders one-click preview and artifact actions`: rendered consumer links.
- `package exposes one-click preview service and video artifact commands`, `preview service and video workflow scripts are present and executable`: command/template assertions. Despite the latter test's title, its file loop checks `isFile()`, not executable permission bits or installation.

**Last execution:** not run. For later authorized fixture execution, inspect `withPreviewSurface` (fixed ports and explicit fixture mode) and [`playwright.config.mjs`](../../playwright.config.mjs), `webServer` (may reuse an existing server outside CI). Select an isolated free port, explicit fixture mode and avoid existing deployed services. [`package.json`](../../package.json), `scripts.test`, and [`.gitlab-ci.yml`](../../.gitlab-ci.yml), `browser-game-smoke`, define broader execution paths, but no CI or browser result is asserted here.

**Refresh when:** incoming route exposure, registry URL/shape, capability flags/defaults, subprocess contracts, service templates, capture health assumptions or regression assertions change. Reinspect sources and consumers, update revision/date or mark stale under the [index contract](index.md#verification-and-refresh-contract). Deployed proxy/authentication, external agents/cron/clients and actual installed service state remain unknown; health cannot prove their absence.


## Public playable package — navigation, not re-verification

The opt-in [standalone static entrypoint](../../scripts/playable-service.mjs) reads only an [explicit asset registry](../../deploy/playable-registry.json); [offline staging](../../scripts/stage-playable.mjs) creates a separate public release. The [OS deployment runbook](../public-playable-deployment.md) and [system-unit template](../../deploy/systemd/agent-playable.service.in) require a dedicated unprivileged user outside operator home/store. Existing preview entrypoints remain unchanged. Follow [HTTP boundary tests](../../tests/playable-static.node.mjs), [export tests](../../tests/playable-stage.node.mjs), and [source/real-browser contract tests](../../tests/playable-contract.node.mjs). [Remaining editable migration](../game-dev-operator-migration.md) targets gamedev, not the public player origin. These inspected new paths do not refresh the older card evidence or prove live isolation; independent semantic review and activation receipts remain open.

## Scoped operator read/domain checkpoint — not activation

For a “discipline lane” detail without worker diagnostics, follow [the read contract](../game-dev-operator-read.md) → [`handleGameDevRequest`](../../scripts/game-dev-api.mjs) → [`gameBoard`, `gameTask`, `gameRoster`, `readTaskSnapshot`](../../scripts/kanban-operations.mjs) → [`kanban-readonly.py`](../../scripts/kanban-readonly.py). [`game-dev-operator.node.mjs`](../../tests/game-dev-operator.node.mjs) covers fixed default board, scoped history/dependencies, archived readback, unknown statuses, query/method denials and actual public-static API denial. General `liveBoard` shares the loader. The later shared WRITE checkpoint below supersedes the read-only write-status statement; general detail/execution and frontend controls remain. Read-only SQLite avoids CLI initialization/recompute; WAL read-mark bookkeeping is documented separately. The current preview route gate is unchanged and not an auth boundary. Full editable migration, protected-host wiring and deployed acceptance remain open. Baseline evidence metadata below is not refreshed by this navigation addition.

## Pending build-download integration

Follow [the staged surface contract](../game-build-downloads.md) to `handleGameDevRequest` in [game-dev-api](../../scripts/game-dev-api.mjs), `downloadBuild` in [game-build-store](../../scripts/game-build-store.mjs), and [the game dashboard](../../games/dev/index.html). Existing app Game Dev remains the active operator UI. The new backend task projection is default-disabled, with shared scoped writes now implemented but not activated; it is not the general bridge. Review [fixture route/download tests](../../tests/game-build-surface.node.mjs) before refreshing these baseline claims. This is a partial migration, not a deployment receipt.


## Shared WRITE backend — uncommitted source checkpoint

For a “playtest observation” or queued evidence retry, follow [the WRITE contract](../game-dev-operator-write.md) → [`createTask`, `writeTask`, `writeLink`](../../scripts/kanban-writes.mjs) → [shared command construction](../../scripts/kanban-commands.mjs) and [the one evidence lock module](../../scripts/kanban-evidence.mjs). Both [general](../../scripts/kanban-bridge.mjs) and [scoped](../../scripts/game-dev-api.mjs) adapters use these operations, not a general-router proxy. [Persisted bidirectional/concurrency tests](../../tests/game-dev-write.node.mjs) use a labeled [synthetic CLI fixture](../../tests/helpers/operator-fixture.py); installed CLI create was guard-denied, not successful. [`package.json`](../../package.json) and [CI](../../.gitlab-ci.yml) explicitly run the operator suites.

Scope fixed to default/game, after-lock reauthorization, exact archived-target readback, shared canonical DB/task keys and deterministic endpoint locking are source invariants. The Map does **not** fence outside processes; external membership races and installed lifecycle effects remain activation gates. No production services, frozen static/publisher/native assets, or editable frontend were changed. Current owner-reported infrastructure/cookie/public-ZIP requirements and human-only merge authority are centralized in [remaining migration](../game-dev-operator-migration.md#corrected-owner-receipts--current-next-stage-authority). Independent WRITE semantic review remains open; baseline map revision/date/hashes are intentionally not refreshed.
