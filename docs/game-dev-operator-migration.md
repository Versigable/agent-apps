# Editable Game Dev migration — deployed board and remaining closure

## Current status — editable board deployed and user-confirmed

The core editable Game Dev board is activated, not merely planned. The live `agent-app-preview.service` runs `/home/merquery/projects/game-build-downloads/editable-release/candidate` on the existing operator process/store. Authentik-protected gamedev and app-preview share 4175; public game-preview remains isolated static-only 4173. The existing published native build is now wired into the live operator catalog and download UI; remaining closure is limited to provenance and the explicitly unverified areas below.

Evidence authority is the external project `/home/merquery/projects/game-build-downloads/`: `migration-completion-audit.md`, `editable-release/verification.md`, `editable-release/activation.json`, and `editable-browser-evidence/receipt.json`. This documentation refresh reads receipts; it does not rerun production probes or certify remote CI.

| Acceptance area | Recorded result and boundary |
| --- | --- |
| Editable package | Frozen `editable-release/candidate` deployed; audit reports zero manifest mismatches. This is an uncommitted worktree package, not a committed/tagged release. |
| Package verification | 55 operator tests, 15 frontend tests, 64 general Kanban/preview browser tests passed; 32 installed-Hermes lifecycle calls succeeded in isolated HOME/DB, including archive. Real Chromium/SQLite bidirectional scoped/general workflow passed. These are parent receipts, not tests rerun by this docs task. |
| Owner acceptance | Screenshot/message `1553915660910723232` confirms authenticated gamedev live mode/writes enabled, Unity Pipeline Fixture and two done tasks. It accepts the board view, not every production mutation or a fresh logout/nonoperator matrix. |
| Store and routing | Audit reads `t_ff2e5bd8` and `t_4c1af45b` with identical IDs/statuses through the general API. Gamedev denies general Kanban API (403); both operator hosts deny fps-gauntlet player route (403). |
| Public continuity | Audit reports `agent-playable.service` PID `2011912` unchanged across operator cutover. Local public4173 ZIP GET200: exactly `32406730` bytes, SHA-256 `a6f0239358a6af7a94425dd8729d7b85e5283d7dc8d43ee38c919e9e4f647a11`. Local byte continuity is not a new remote-ingress test. |
| Published build catalog | The audit’s empty catalog finding is superseded by parent live closure: explicit `GAME_BUILD_STORE=/home/merquery/projects/game-build-downloads/release-gdp002-zip1/private-store`; catalog lists `gdp-002-kit-v0.1-zip1/linux-x64`. `build-catalog-live-closure.json` records operator GET200 and the same exact bytes/digest above. `build-catalog-browser.json` records read-only Chromium selection and both “Download ZIP” and “Download selected native build” pointing to the exact operator download URL. Local Host mapping is not ingress-authentication proof or a production evidence-write test. |
| Media | Selected native screenshot/video/download reference fields were null; screenshot showed unavailable. No media or new build execution is invented. |
| Provenance | Parent owns commit/push, branch provenance and current remote CI. No tagged-source or current remote CI closure is established by these receipts. |

The [editable activation contract](game-dev-editable-activation.md) describes the transactional installed writer, application CSRF session and trusted frontend allowlist. Source guarantees, isolated installed tests, deployment probes and user acceptance are separate evidence layers. The packaged download suite recorded 56 passes and one Git-root-dependent failure because the immutable package lacks `.git`; the same publisher source suite passed 57. The external verification receipt also preserves the initially incorrect browser fixture configuration and successful explicit-fixture rerun.

## Remaining closure

- Preserve the authentic published ZIP and verified catalog/download identity. New production evidence-write acceptance is not inferred from the read-only catalog browser receipt. Original immutable notes retain obsolete private-staging wording; later owner release authorization supersedes that wording without rewriting immutable notes.
- Keep absent native media honest; populate only from separately verified artifacts.
- Parent completes source/branch/commit/push and current remote CI provenance. Historical pipeline receipts below are not current release CI.
- Fresh logout/nonoperator/all-method ingress or broader production-mutation acceptance needs its own receipt; do not infer it from the screenshot.
- Repo-brain baseline source fingerprints remain explicitly stale pending semantic reinspection; documentation inventory generation is not source re-verification.

## Historical implementation stages — not current activation instructions

Everything below preserves original approved plans/checkpoints. “Planned”, “not activated”, “still aliases app-preview”, open review gates and draft-MR statuses describe those historical stages only. The current status above supersedes their activation status, without retroactively claiming their tests succeeded or granting new production/infrastructure authority.

**Historical source follow-up:** [editable activation](game-dev-editable-activation.md) supplies the transactional installed writer, parent-approved app CSRF-session alternative and trusted shared-frontend allowlist. Backend source is not deployment/authenticated-user acceptance. Earlier planned/owed statements below describe historical stages; parent owns current integrated release and repo-brain evidence.

**Later source-only security checkpoint:** [operator HTTP security](operator-http-security.md) implements exact Origin/JSON/CORS/Host routing in the shared dispatcher, pending independent review and deployment. Earlier statements below that security implementation is still owed describe the prior checkpoint. Session-bound CSRF and WRITE review R1–R3 remain scoped-editing gates; they do not block security/static cutover while editing stays disabled. No live protection or editable migration completion is claimed.

**Historical status at the planning checkpoint: full editable migration was planned, not activated.** The [scoped read/domain checkpoint](game-dev-operator-read.md) is independently approved and the [shared WRITE backend checkpoint](game-dev-operator-write.md) is implemented in source, pending independent write review. No editable frontend, host/Origin/CSRF integration, backend activation or user-acceptance completion is claimed. This supersedes the earlier game-play/reclaimed-game-preview proposal. The user still requires a **full editable migration**, not a download page or read-only substitute.

## Fixed architecture and acceptance

PUBLIC `game-preview.ninjaprivacy.org` → isolated static-only 4173. Authentik-protected `gamedev.ninjaprivacy.org` → existing operator process on 4175. `app-preview.ninjaprivacy.org` → unchanged operator process and authoritative store on 4175. No second task DB, no copy/sync migration, no second evidence-lock process. No game scripts on either operator origin. No new player origin or clean-client privilege promotion gate; those requirements are obsolete because the existing player origin never acquires operator privilege.

Completion means editable board, scoped task creation/management, capture and evidence at gamedev; identical IDs/history visible through existing general board; approved app management and high-friction execution preserved; native build selection/downloads retained on operator routes; playable assets isolated; auth/CSRF/backend/OS receipts and independent review complete; deployed navigation verified. A staged static service satisfies only the first code boundary.

## First slice: shared operations and scoped read contract

Read/domain source is now implemented; review [its exact contract and audit limitations](game-dev-operator-read.md) before the next vertical slice. The subsequent shared WRITE backend now extracts command construction and serialized operations, reused by both adapters; see its compatibility and external-writer limits. Snapshot projection extends `kanban-readonly.py`; general detail/execution controls remain, and general create retains its legacy receipt while the scoped write gate is off. Installed CLI helper initialization mutated isolated fixture bytes before the delegation guard denied it; never use those helpers for scoped GETs. Full editable migration remains next.

Owned proposed files: `scripts/kanban-operations.mjs` (new), `scripts/kanban-bridge.mjs`, `scripts/game-dev-api.mjs`, `tests/game-dev-operator.node.mjs` (new), relevant map cards. Do not edit native catalog overlay or publisher files without their integration owner. Keep activation disabled and app behavior unchanged.

1. Write failing tests for fixed-board/game membership before extracting code. Extract reusable board/detail/create/action/comment/evidence operations from the existing bridge **without importing its unrestricted HTTP handler into the scoped router**. Preserve one process/store/lock context. Pass explicit trusted configuration; reject caller board/query overrides rather than silently ignore them.
2. Add scoped capability, board, roster and task-detail handlers. Capabilities truthfully advertise only implemented enabled actions. Recompute counts from selected-game tasks and preserve unknown statuses. Exclude bodies/IDs of out-of-game dependencies and raw runs/log/context/diagnostics (the current detail helper includes these even if tabs are hidden). Detail/comments/events/evidence need explicit field projections, not spread-copy responses. Unknown route/game/task/fields fail closed; sanitize adapter errors.
3. Resolve actual installed Hermes DB/HOME/env semantics without modifying production. Use isolated initialized HOME/DB for contract tests; inspect installed read paths so GETs cannot migrate schema or recompute readiness. Hash/fingerprint isolated DB and sidecars before/after read-only batches. Do not substitute fixtures on live read failure. Archive-aware scoped readback must be designed before archive writes, not inferred from card disappearance.
4. Run all existing app tests before and after extraction and new cross-game/general-task denial tests. Release a reviewable checkpoint before implementing the next action family.

## Subsequent vertical slices (each RED → GREEN → regression → review)

### Trusted host/route and browser write boundary

Files: `scripts/preview-service.mjs`, proposed `scripts/operator-policy.mjs`, scoped API tests, deployment docs. Implement explicit exact host/route policy for app-preview vs gamedev in **the same 4175 process**. No generic `/api/kanban` fallback through gamedev, no broad games directory on operator hosts. Serve only trusted operator shell/modules and reviewed raster/video references; native ZIPs remain attachment-only. Health reports no paths. Unknown hosts, aliases and methods fail closed without changing default production activation in an unapproved package.

Host headers are not authentication. Owner supplies Authentik operator-group policy and authenticated backend trust receipt. Writes on both adapters require bounded JSON, exact configured HTTPS Origin (not inferred from Host), appropriate session-bound CSRF mechanism and defense-in-depth fetch metadata checks. Reject missing/foreign/null origins before any backend work, including simple form bodies. Remove wildcard operator CORS. Owner reports a domain-wide cookie (not host-only) under the existing Hokagis gate. Preserve that approved policy; no new provider/per-host policy or forwarded identity trust. Exact Origin protection is still mandatory, and cookie/proxy/backend checks remain integration evidence. Sibling player origin is same-site; SameSite alone is insufficient. Keep app functionality intact, not read-only as a shortcut.

### Scoped create and playtest capture

Implemented in the [source-only shared WRITE backend](game-dev-operator-write.md), with triage-only scoped creation and preserved general direct-create controls. Persisted synthetic SQLite roundtrips pass; actual installed CLI creation was denied by the delegation guard, retained intact. Remaining acceptance below is not a claim of successful installed writes.

Routes under `/api/game-dev/games/:game`: `POST /tasks`, plus capture using the shared validator. Server selects the authoritative board; canonical game metadata must match the route and cannot be forged through duplicate body fences. Validate every parent/dependency belongs to that same game/board. Preserve triage/unassigned capture semantics, raster limits, unknown build identity, retry keys and attribution. No implicit ready promotion or dispatch. Test normal creation and capture via isolated real CLI/DB, including oversized UTF-8 payload and retry conflict cases.

### Scoped ordinary management and evidence

Shared backend families are implemented and tested; editable shell, security integration and independent WRITE review remain. Read the [exact lock/race/retry contract](game-dev-operator-write.md) before activation: an in-process lock is not external-process authorization fencing.

Implement one tested action family at a time: comments; assign/unassign; block/unblock; complete/archive; reassign/reclaim; completion result/summary/metadata edit; same-game dependency link/unlink; evidence append/readback. Validate task membership before reads/mutations and both link endpoints; revalidate where concurrent writers could change classification. Preserve current classification immutability or implement transactional checks, not a race-prone promise. Confirm exact-target persisted readback including archive. Reuse the same evidence lock across both host adapters; concurrent cross-surface retries must yield one evidence record even after a lost reply.

Execution dispatch/claim, board administration/switching and unrestricted diagnostic/log/context tabs stay on existing app-host controls with clear links. This does not remove them from the product; Game Dev gets all ordinary editable management. Any requirement to duplicate high-friction execution locally needs separate scope approval, not mounting the general router.

### Shared frontend transport and trusted shell

Files: `apps/kanban/{app,game-dev,playtest-capture,build-evidence}.js`, trusted `games/dev` shell or new operator shell, scoped browser tests. Extract injectable transport/capabilities; reuse renderer, drawer, roster, validation and forms rather than fork a reduced board. Remove unconditional `/boards`/`execution/status` fetches only for the scoped adapter. Keep shared modules exposed by exact mapped paths on gamedev, never all app/game source. Integrate existing build/version/platform selection alongside editable board, with honest native no-build state and no native/browser capture identity substitution.

Keep game/board/drawer/edit generations, A→B→A stale-response protection, per-game drafts, screenshot decode cancellation, cached-tab reconciliation and unchanged-draft idempotency. Writes require persisted readback. Test delayed POST + board/game switch/close/refresh/tab/edit, invalid payload produces no request, auth expiry produces a clear error without fixture substitution. Preserve board first-screen hierarchy and desktop/mobile tests.

Navigation: change link interception in `game-dev.js` as well as HTML/launcher links; gamedev destination has canonical slash and selected game/build deep links. Leave the existing functional app Game Dev fallback until acceptance. Play/evidence URLs retain game-preview; do not globally replace historical links. Trusted operator links to players use `noopener noreferrer`; no game JS imports, opener, token or postMessage credential bridge. Public launcher need not expose operator navigation.

## Evidence before activation

- Isolated shared-store roundtrip: create via Game Dev, read/edit via general board, reread via Game Dev and reverse; assert identical IDs/history, one DB and one evidence idempotency context. No production mutation probes.
- Browser malicious-player fixtures against authenticated operator/nonoperator sessions: fetch, form/simple body, frames, opener, postMessage and opaque `Origin: null`; assert denial **and unchanged isolated DB**, not merely unreadable CORS responses.
- Existing 120-test app/game regression retained, new scoped operator tests explicitly in CI, Python/map gates. Counts are historical package evidence, not a promised future result.
- Independent review of operator scoping, CSRF/auth, native publisher (existing focused R1/R1b/R2 approval preserved but not expanded), public static boundary and deployment templates. Human merge required; never integrate worktree node_modules symlink or silently absorb inherited native overlay.
- Owner verifies exact DNS/TLS/middleware/hosts, anonymous/nonoperator/operator matrix for both operator origins, backend bypass/forged header tests from relevant positions, cookie attributes and installed same-process/store identity. Firewall remote timeout remains reported until independently evidenced.
- Deploy static OS isolation first using [public runbook](public-playable-deployment.md); verify actual service UID, deny reads of real private paths, read-only assets, correct process/revision and public game compatibility before removing player Authentik. Then deploy scoped operator code and owner-enable gamedev routes after auth receipts. No listener rebinding or firewall changes are authorized by these steps.
- Rollback disables gamedev routes and restores navigation to still-working app view; never re-expose old broad service publicly. No DB/history rollback.

Independent WRITE review, application security/Host isolation, remote CI, authorized installed-CLI write proof, OS/cutover receipts, remaining editable frontend and full user acceptance remain open. The same-store synthetic bidirectional fixture proof is delivered, not equivalent to installed-CLI success. Reviewer/integration owner must be named by parent; infrastructure approval owner is metaversig. This document is concrete implementation scope, not approval to activate services.


## Corrected owner receipts — current next-stage authority

Owner reports infrastructure !112 **already merged by Eric**, pipeline **286 passing**; gamedev behind Hokagis currently **aliases app-preview**, because Host scoping is absent. This is not a completed Game Dev migration. Hokagis operator access covers MetaVersig, Firekube and accepted break-glass ultradmin; anonymous and EnchantedGamesDevs denied. Cookie is domain-wide, not host-only. These are owner-reported screenshot receipts, not fresh probes by this backend writer.

Every 4175 write on **both hosts** still needs exact Origin + JSON-only enforcement, no wildcard CORS, and gamedev Host scoping; session-bound CSRF/backend-bypass and browser acceptance remain the security integration stage. Propose that shared boundary separately; preserve general controls and do not silently activate it in this backend checkpoint.

Public4173 must gain a separately reviewed **published-only immutable versioned ZIP download** extension with exact digest/attachment/path safety, read-only access and no task-store or operator-write authority. The frozen static package is unchanged here; its prior blanket no-native-store assumption is superseded for the next package. Publishing remains operator-only; no HTTP upload is proposed.

**Only MetaVersig and Firekube merge homelab-infra.** Claude Code reviews/recommends, never merges and has no Maintainer token. Corrected owner screenshot: `1553571607203676192`. **!113 remains draft** until protections are live on4175, static-only4173 is established, and published-only digest-matched ZIP downloads are reviewed. No production activation authority is delegated to this child. See the [WRITE checkpoint](game-dev-operator-write.md) for the precise remaining gate list.
