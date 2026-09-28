# Preview routing repo brain

> STALE: Baseline dispatcher, consumer and test evidence predates the deployed editable operator and published ZIP integration. Current deployment receipts are linked separately; they do not semantically reverify this historical source map. Retain baseline revision/date/hashes until source and incoming consumers are reinspected. Semantic review owner unknown; parent owns release/CI provenance.

## Current deployment navigation — receipt-backed, not baseline re-verification

The editable board is deployed from `editable-release/candidate` and user-confirmed (`1553915660910723232`). Gamedev and app-preview share operator4175/store; public static4173 remains separate. The existing native build catalog and exact operator ZIP download are now live, backed by `build-catalog-live-closure.json` and read-only `build-catalog-browser.json` in the external project. Follow [canonical migration status](../game-dev-operator-migration.md#current-status--editable-board-deployed-and-user-confirmed) for acceptance, exact ZIP identity, receipt paths and limitations, then [editable activation](../game-dev-editable-activation.md) for writer/CSRF/frontend contracts. No current remote CI or committed-release provenance is asserted.

## Historical map and source checkpoints

All baseline behavior, line numbers, “not activated”, aliasing, pending-review and runtime-not-checked statements below describe the recorded source/checkpoint scope, not current service status. Source fingerprints remain stale: this receipt refresh does not claim full source or incoming-consumer reinspection.

A source-navigation map, not a replacement specification or deployment receipt. Start with the relationship you are changing, then verify its cited source.

## Evidence boundary

- **Source revision:** `a3da91f69d24c14f6612b2a1fcdae7d2abb4f1b4` (all source citations in this directory refer to this baseline).
- **Verified on:** 2026-09-24, by static source/test inspection and local link/symbol checks only.
- **Implementation:** live code paths, meaning wired in source, not observed deployment.
- **Evidence:** verified-at-revision; **runtime:** not checked; **tests:** inspected, not run for this map.
- **Owner / approval owner:** unknown; no ownership assignment established in the inspected material.
- Inspected on branch `docs/repo-brain-pilot`, HEAD `3a4ff139de92230edf8ead9b508709cb2e7ae6dc`, initially clean. HEAD adds only the pilot protocol to the baseline; inspected source remains identical.

## Choose a path

| Change or unfamiliar term | Read next | Owning entry point |
| --- | --- | --- |
| Landing page, operator dock, arcade, surface selection, redirects, static assets, manifest endpoint | [Request routing](preview-routing.md) | [`scripts/preview-service.mjs`](../../scripts/preview-service.mjs): `handler`, `safeStaticPath` |
| Kanban reachability versus write permission, health semantics, launchers, capture tooling, deployment configuration | [Immediate consumers and capability boundary](preview-consumers.md) | `handleKanbanRequest`, launcher `loadManifest`, capture `healthOk` |
| Discipline lane, scoped task detail/history, default board, read-side effects | [Scoped operator read checkpoint](../game-dev-operator-read.md) | `gameBoard`, `gameTask`, `gameRoster`, `readTaskSnapshot`; source-only, remaining editable migration required |
| Pilot scope and evaluation procedure | [Approved protocol](../plans/2026-09-24-repo-brain-pilot.md) | Protocol, not an evaluation result |

The flow is **process configuration → surface predicates → ordered HTTP dispatch → bridge or allowlisted static file → browser/tool consumer**. Health is a separate observation path, not proof that the rest of this flow succeeds. Keep route exposure, bridge capability, and deployment identity distinct.

## Verification and refresh contract

Existing source, tests and [README](../../README.md) remain authoritative. Cards name the focused assertions in [`tests/preview-workflow.spec.mjs`](../../tests/preview-workflow.spec.mjs), including `withPreviewSurface`; [`playwright.config.mjs`](../../playwright.config.mjs), `webServer`, governs server setup. No test or service was started for map authoring. The protocol's test execution and independent-reader acceptance criteria remain separate from static map authoring; see the [pilot evidence package](../brain-pilot/README.md) for those results. Fixture tests do not establish deployed runtime state.

Update affected cards in the same change when routes, predicates, environment contracts, bridge capabilities, consumers, tests or ownership change; otherwise document why there is no map impact. Compare cited symbols and incoming callers, not just path existence. Advance revision/date only after semantic reinspection; mark stale when that cannot be done. Record any future runtime receipt separately without turning this static verification into a deployment claim.

## Limits and rationale

**Documented rationale:** [README, “One-click internal preview”](../../README.md#one-click-internal-preview) describes separately targetable app/game surfaces; the cards connect that intent to code. **Inferred rationale** is labeled on the cards; historical reasons not present in inspected sources are **unknown**.

Coverage is the preview dispatcher and selected immediate consumers, not an exhaustive dependency graph or security audit. External clients, deployed reverse-proxy/access controls, installed units, live task stores, running revisions, cron and other repositories are uninspected and **unknown**, not absent. No claim that unrelated apps or Python utilities are unaffected follows from this slice.


## Public playable package — navigation, not re-verification

The opt-in [standalone static entrypoint](../../scripts/playable-service.mjs) reads only an [explicit asset registry](../../deploy/playable-registry.json); [offline staging](../../scripts/stage-playable.mjs) creates a separate public release. The [OS deployment runbook](../public-playable-deployment.md) and [system-unit template](../../deploy/systemd/agent-playable.service.in) require a dedicated unprivileged user outside operator home/store. Existing preview entrypoints remain unchanged. Follow [HTTP boundary tests](../../tests/playable-static.node.mjs), [export tests](../../tests/playable-stage.node.mjs), and [source/real-browser contract tests](../../tests/playable-contract.node.mjs). [Remaining editable migration](../game-dev-operator-migration.md) targets gamedev, not the public player origin. These inspected new paths do not refresh the older card evidence or prove live isolation; independent semantic review and activation receipts remain open.

## Public ZIP cancellation and CI — scoped source inspection

For a “disconnected downloader” or pre-header hash work, follow [the public ZIP contract](../public-downloads.md#http-and-integrity-behavior) → exact registry dispatch in [`createPlayableServer`](../../scripts/playable-service.mjs) → [`sendDownload` and `verifiedDownload`](../../scripts/playable-downloads.mjs). Cancellation listeners are installed before verification; premature response/socket close cancels hash and transfer, while normal incoming GET completion does not. Hash and transfer retain the same pinned descriptor, 64 KiB buffers and generic failures. Offline [export](../../scripts/export-playable-downloads.mjs) still calls verification without a request signal; [staging](../../scripts/stage-playable.mjs) copies the runtime reader, not the exporter or publisher.

[`tests/public-downloads.node.mjs`](../../tests/public-downloads.node.mjs) gates real GET/HEAD streams before headers, repeats aborts with FD/work/listener assertions, checks already-disconnected/open-race and transfer cancellation, and preserves staged digest/HEAD regression. [`package.json`](../../package.json) now includes it explicitly in `test:playable-static`; [CI](../../.gitlab-ci.yml) already invokes that suite after installing Python/unzip. Node suites remain outside Playwright discovery. This source-flow/consumer inspection covers only ZIP cancellation and its test integration, not older operator claims. Baseline manifest hashes/dates/stale declarations stay unchanged; inventory regeneration is not re-verification. Parent owns fresh independent review and any release; production isolation, ingress capacity and genuine public-origin receipts are not verified here.

## Pending build-download integration

Follow [the staged surface contract](../game-build-downloads.md) to `handleGameDevRequest` in [game-dev-api](../../scripts/game-dev-api.mjs), `downloadBuild` in [game-build-store](../../scripts/game-build-store.mjs), and [the game dashboard](../../games/dev/index.html). Existing app Game Dev remains the active operator UI. The new backend task projection is default-disabled, with shared scoped writes now implemented but not activated; it is not the general bridge. Review [fixture route/download tests](../../tests/game-build-surface.node.mjs) before refreshing these baseline claims. This is a partial migration, not a deployment receipt.


## Shared WRITE backend — uncommitted source checkpoint

For “unrelated retained history” or general detail overflow, follow [WRITE remediation and capacity limits](../game-dev-operator-write.md#write-review-remediation-source-only) → `loadTaskDetail` in [the general bridge](../../scripts/kanban-bridge.mjs) → `readTaskHistory` in [operations](../../scripts/kanban-operations.mjs) → parameterized `--general-task` in [the read-only helper](../../scripts/kanban-readonly.py). This archive-aware exact-target path replaces the board-wide general history snapshot; scoped snapshots remain separate. [WRITE tests](../../tests/game-dev-write.node.mjs) include >8 MiB unrelated archived history with scoped gates off, chronological/dependency ordering and original-ID readback. Source-only N1 correction; parent-owned installed adapter rerun and independent review remain required. This navigation addition does not refresh the stale baseline map evidence or assert deployment.

For a “playtest observation” or queued evidence retry, follow [the WRITE contract](../game-dev-operator-write.md) → [`createTask`, `writeTask`, `writeLink`](../../scripts/kanban-writes.mjs) → [shared command construction](../../scripts/kanban-commands.mjs) and [the one evidence lock module](../../scripts/kanban-evidence.mjs). Both [general](../../scripts/kanban-bridge.mjs) and [scoped](../../scripts/game-dev-api.mjs) adapters use these operations, not a general-router proxy. [Persisted bidirectional/concurrency tests](../../tests/game-dev-write.node.mjs) use a labeled [synthetic CLI fixture](../../tests/helpers/operator-fixture.py); installed CLI create was guard-denied, not successful. [`package.json`](../../package.json) and [CI](../../.gitlab-ci.yml) explicitly run the operator suites.

Scope fixed to default/game, after-lock reauthorization, exact archived-target readback, shared canonical DB/task keys and deterministic endpoint locking are source invariants. The Map does **not** fence outside processes; external membership races and installed lifecycle effects remain activation gates. No production services, frozen static/publisher/native assets, or editable frontend were changed. Current owner-reported infrastructure/cookie/public-ZIP requirements and human-only merge authority are centralized in [remaining migration](../game-dev-operator-migration.md#corrected-owner-receipts--current-next-stage-authority). Independent WRITE semantic review remains open; baseline map revision/date/hashes are intentionally not refreshed.
