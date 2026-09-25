# Immediate consumers — reachability is not capability

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
